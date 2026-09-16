const http = require("http");
const fs = require("fs");
const path = require("path");

const DOMAIN = process.env.KINTONE_DOMAIN;

const CUSTOMER_APP_ID =
  process.env.KINTONE_CUSTOMER_APP_ID || "1349";

const CUSTOMER_TOKEN =
  process.env.KINTONE_CUSTOMER_API_TOKEN;

const VISIT_APP_ID =
  process.env.KINTONE_VISIT_APP_ID || "1350";

const VISIT_TOKEN =
  process.env.KINTONE_VISIT_API_TOKEN;

// ========================================
// 共用回應函式
// ========================================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });

  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end(text);
}

// ========================================
// 讀取 Request Body
// ========================================

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString("utf8");
    });

    req.on("end", () => {
      resolve(body);
    });

    req.on("error", reject);
  });
}

// ========================================
// Kintone 共用呼叫
// ========================================

async function callKintone({
  appId,
  token,
  method,
  apiPath,
  queryParams,
  body
}) {
  let url = `${DOMAIN}${apiPath}`;

  if (queryParams) {
    url += `?${queryParams.toString()}`;
  }

  const options = {
    method,
    headers: {
      "X-Cybozu-API-Token": token
    }
  };

  if (body) {
    options.headers["Content-Type"] =
      "application/json";

    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  const rawText = await response.text();

  let data = {};

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    data = {
      message: rawText || "Kintone 回傳非 JSON 內容"
    };
  }

  if (!response.ok) {
    const error = new Error(
      data.message || "Kintone API 執行失敗"
    );

    error.statusCode = response.status;
    error.details = data;

    throw error;
  }

  return data;
}

// ========================================
// 避免 Kintone Query 特殊字元造成問題
// ========================================

function escapeKintoneQueryValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

// ========================================
// 查詢客戶主檔 1349
// ========================================

async function findCustomer(taxId) {
  const safeTaxId =
    escapeKintoneQueryValue(taxId);

  const query =
    `統一編號 = "${safeTaxId}" limit 1`;

  const params = new URLSearchParams({
    app: CUSTOMER_APP_ID,
    query
  });

  const data = await callKintone({
    appId: CUSTOMER_APP_ID,
    token: CUSTOMER_TOKEN,
    method: "GET",
    apiPath: "/k/v1/records.json",
    queryParams: params
  });

  if (!data.records || data.records.length === 0) {
    return null;
  }

  const record = data.records[0];

  return {
    統一編號:
      record["統一編號"]?.value || "",
    客戶名稱:
      record["客戶名稱"]?.value || "",
    電話:
      record["電話"]?.value || ""
  };
}

// ========================================
// 新增客戶主檔 1349
// ========================================

async function createCustomer(formData) {
  return await callKintone({
    appId: CUSTOMER_APP_ID,
    token: CUSTOMER_TOKEN,
    method: "POST",
    apiPath: "/k/v1/record.json",
    body: {
      app: CUSTOMER_APP_ID,
      record: {
        統一編號: {
          value: formData.統一編號
        },
        客戶名稱: {
          value: formData.客戶名稱
        },
        電話: {
          value: formData.電話 || ""
        }
      }
    }
  });
}

// ========================================
// 新增拜訪紀錄 1350
// ========================================

async function createVisit(formData) {
  /*
    重要：
    客戶名稱、電話是 Lookup 複製欄位，
    不由 REST API 直接寫入。

    只傳統一編號，讓 Kintone Lookup
    自動帶出客戶名稱與電話。
  */

  return await callKintone({
    appId: VISIT_APP_ID,
    token: VISIT_TOKEN,
    method: "POST",
    apiPath: "/k/v1/record.json",
    body: {
      app: VISIT_APP_ID,
      record: {
        統一編號: {
          value: formData.統一編號
        },
        拜訪日期: {
          value: formData.拜訪日期
        },
        拜訪對象: {
          value: formData.拜訪對象
        },
        拜訪內容: {
          value: formData.拜訪內容
        },
        下一步: {
          value: formData.下一步
        }
      }
    }
  });
}

// ========================================
// HTTP Server
// ========================================

const server = http.createServer(
  async (req, res) => {
    try {
      const requestUrl = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );

      // ----------------------------------
      // 顯示 WOFF 表單
      // ----------------------------------

      if (
        req.method === "GET" &&
        requestUrl.pathname === "/"
      ) {
        const htmlPath = path.join(
          __dirname,
          "visit-form.html"
        );

        const html = fs.readFileSync(
          htmlPath,
          "utf8"
        );

        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8"
        });

        res.end(html);
        return;
      }

      // ----------------------------------
      // 健康檢查
      // ----------------------------------

      if (
        req.method === "GET" &&
        requestUrl.pathname === "/health"
      ) {
        sendJson(res, 200, {
          status: "ok"
        });

        return;
      }

      // ----------------------------------
      // 依統一編號查詢客戶主檔
      // GET /api/customer?taxId=12345678
      // ----------------------------------

      if (
        req.method === "GET" &&
        requestUrl.pathname === "/api/customer"
      ) {
        const taxId = String(
          requestUrl.searchParams.get("taxId") || ""
        ).trim();

        if (!taxId) {
          sendJson(res, 400, {
            success: false,
            message: "請輸入統一編號"
          });

          return;
        }

        const customer =
          await findCustomer(taxId);

        if (!customer) {
          sendJson(res, 200, {
            success: true,
            found: false,
            message:
              "查無客戶，請輸入客戶名稱與電話"
          });

          return;
        }

        sendJson(res, 200, {
          success: true,
          found: true,
          customer
        });

        return;
      }

      // ----------------------------------
      // 建立拜訪紀錄
      // POST /api/visit
      // ----------------------------------

      if (
        req.method === "POST" &&
        requestUrl.pathname === "/api/visit"
      ) {
        const rawBody = await readBody(req);

        let formData;

        try {
          formData = JSON.parse(rawBody);
        } catch (error) {
          sendJson(res, 400, {
            success: false,
            message: "送出的資料格式不正確"
          });

          return;
        }

        formData.統一編號 =
          String(formData.統一編號 || "").trim();

        formData.客戶名稱 =
          String(formData.客戶名稱 || "").trim();

        formData.電話 =
          String(formData.電話 || "").trim();

        formData.拜訪日期 =
          String(formData.拜訪日期 || "").trim();

        formData.拜訪對象 =
          String(formData.拜訪對象 || "").trim();

        formData.拜訪內容 =
          String(formData.拜訪內容 || "").trim();

        formData.下一步 =
          String(formData.下一步 || "").trim();

        const requiredFields = [
          "統一編號",
          "拜訪日期",
          "拜訪對象",
          "拜訪內容",
          "下一步"
        ];

        const missingFields =
          requiredFields.filter(
            fieldName => !formData[fieldName]
          );

        if (missingFields.length > 0) {
          sendJson(res, 400, {
            success: false,
            message:
              `請填寫：${missingFields.join("、")}`
          });

          return;
        }

        /*
          後端再次檢查，不能只相信前端查詢結果。
          避免使用者查完後，客戶資料剛好被新增或異動。
        */

        let customer =
          await findCustomer(formData.統一編號);

        let customerCreated = false;

        if (!customer) {
          if (!formData.客戶名稱) {
            sendJson(res, 400, {
              success: false,
              message:
                "這是新客戶，請填寫客戶名稱"
            });

            return;
          }

          await createCustomer(formData);

          customerCreated = true;

          /*
            客戶主檔建立後，再查一次，
            確認 Lookup 來源已存在。
          */

          customer =
            await findCustomer(formData.統一編號);

          if (!customer) {
            throw new Error(
              "客戶主檔已送出，但重新查詢不到資料"
            );
          }
        }

        const visitResult =
          await createVisit(formData);

        sendJson(res, 200, {
          success: true,
          message: "拜訪紀錄建立成功",
          customerCreated,
          customer,
          visitRecordId: visitResult.id,
          revision: visitResult.revision
        });

        return;
      }

      sendText(res, 404, "Not Found");

    } catch (error) {
      console.error(
        "Server error:",
        error.message,
        error.details || ""
      );

      sendJson(
        res,
        error.statusCode || 500,
        {
          success: false,
          message: error.message,
          details: error.details || null
        }
      );
    }
  }
);

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(
    `Server running on port ${port}`
  );
});
