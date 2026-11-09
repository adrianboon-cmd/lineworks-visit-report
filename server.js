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
      message:
        rawText || "Kintone 回傳非 JSON 內容"
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
// 整理 Kintone 客戶資料
// ========================================

function formatCustomerRecord(record) {
  return {
    recordId:
      record["$id"]?.value || "",

    revision:
      record["$revision"]?.value || "",

    統一編號:
      record["統一編號"]?.value || "",

    客戶名稱:
      record["客戶名稱"]?.value || "",

    電話:
      record["電話"]?.value || ""
  };
}

// ========================================
// 依公司名稱模糊搜尋客戶主檔
// ========================================

async function searchCustomersByName(keyword) {
  const safeKeyword =
    escapeKintoneQueryValue(keyword);

  const query =
    `客戶名稱 like "${safeKeyword}" ` +
    `order by 客戶名稱 asc limit 20`;

  const params = new URLSearchParams({
    app: CUSTOMER_APP_ID,
    query
  });

  const data = await callKintone({
    token: CUSTOMER_TOKEN,
    method: "GET",
    apiPath: "/k/v1/records.json",
    queryParams: params
  });

  return (data.records || []).map(
    formatCustomerRecord
  );
}

// ========================================
// 依統一編號精準查詢客戶
// 後端送出前再次確認使用
// ========================================

async function findCustomerByTaxId(taxId) {
  const safeTaxId =
    escapeKintoneQueryValue(taxId);

  const query =
    `統一編號 = "${safeTaxId}" limit 1`;

  const params = new URLSearchParams({
    app: CUSTOMER_APP_ID,
    query
  });

  const data = await callKintone({
    token: CUSTOMER_TOKEN,
    method: "GET",
    apiPath: "/k/v1/records.json",
    queryParams: params
  });

  if (
    !data.records ||
    data.records.length === 0
  ) {
    return null;
  }

  return formatCustomerRecord(
    data.records[0]
  );
}

// ========================================
// 新增客戶主檔
// ========================================

async function createCustomer(formData) {
  return await callKintone({
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
          value: formData.電話
        }
      }
    }
  });
}

// ========================================
// 新增拜訪紀錄
// ========================================

async function createVisit(formData, customer) {
  return await callKintone({
    token: VISIT_TOKEN,
    method: "POST",
    apiPath: "/k/v1/record.json",

    body: {
      app: VISIT_APP_ID,

      record: {
        統一編號: {
          value: customer.統一編號
        },

        客戶名稱: {
          value: customer.客戶名稱
        },

        電話: {
          value: customer.電話
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
      // 依客戶名稱模糊搜尋
      // GET /api/customers?keyword=富士軟片
      // ----------------------------------

      if (
        req.method === "GET" &&
        requestUrl.pathname ===
          "/api/customers"
      ) {
        const keyword = String(
          requestUrl.searchParams.get(
            "keyword"
          ) || ""
        ).trim();

        if (!keyword) {
          sendJson(res, 400, {
            success: false,
            message: "請輸入客戶公司名稱"
          });

          return;
        }

        if (keyword.length < 2) {
          sendJson(res, 400, {
            success: false,
            message:
              "請至少輸入 2 個字再進行搜尋"
          });

          return;
        }

        const customers =
          await searchCustomersByName(
            keyword
          );

        sendJson(res, 200, {
          success: true,
          found: customers.length > 0,
          count: customers.length,
          customers
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

        formData.customerMode =
          String(
            formData.customerMode || ""
          ).trim();

        formData.統一編號 =
          String(
            formData.統一編號 || ""
          ).trim();

        formData.客戶名稱 =
          String(
            formData.客戶名稱 || ""
          ).trim();

        formData.電話 =
          String(
            formData.電話 || ""
          ).trim();

        formData.拜訪日期 =
          String(
            formData.拜訪日期 || ""
          ).trim();

        formData.拜訪對象 =
          String(
            formData.拜訪對象 || ""
          ).trim();

        formData.拜訪內容 =
          String(
            formData.拜訪內容 || ""
          ).trim();

        formData.下一步 =
          String(
            formData.下一步 || ""
          ).trim();

        const requiredFields = [
          "統一編號",
          "客戶名稱",
          "拜訪日期",
          "拜訪對象",
          "拜訪內容",
          "下一步"
        ];

        const missingFields =
          requiredFields.filter(
            fieldName =>
              !formData[fieldName]
          );

        if (missingFields.length > 0) {
          sendJson(res, 400, {
            success: false,
            message:
              `請填寫：${missingFields.join(
                "、"
              )}`
          });

          return;
        }

        if (
          !["existing", "new"].includes(
            formData.customerMode
          )
        ) {
          sendJson(res, 400, {
            success: false,
            message:
              "請先搜尋並選擇客戶，或建立新客戶"
          });

          return;
        }

        /*
          不論前端選擇既有客戶或新增客戶，
          後端都會依統一編號再次確認。
        */

        let customer =
          await findCustomerByTaxId(
            formData.統一編號
          );

        let customerCreated = false;

        // --------------------------------
        // 使用者選擇建立新客戶
        // --------------------------------

        if (
          formData.customerMode === "new"
        ) {
          if (customer) {
            sendJson(res, 409, {
              success: false,
              message:
                "此統一編號已存在客戶主檔，請重新搜尋並選擇既有客戶"
            });

            return;
          }

          await createCustomer(formData);

          customerCreated = true;

          customer =
            await findCustomerByTaxId(
              formData.統一編號
            );

          if (!customer) {
            throw new Error(
              "客戶主檔已送出，但重新查詢不到資料"
            );
          }
        }

        // --------------------------------
        // 使用者選擇既有客戶
        // --------------------------------

        if (
          formData.customerMode ===
          "existing"
        ) {
          if (!customer) {
            sendJson(res, 400, {
              success: false,
              message:
                "找不到所選擇的既有客戶，請重新搜尋"
            });

            return;
          }
        }

        const visitResult =
          await createVisit(
            formData,
            customer
          );

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
