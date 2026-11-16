const http = require("http");
const fs = require("fs");
const path = require("path");

// ========================================
// Environment Variables
// ========================================

const DOMAIN =
  process.env.KINTONE_DOMAIN;

const CUSTOMER_APP_ID =
  process.env.KINTONE_CUSTOMER_APP_ID ||
  "1349";

const CUSTOMER_TOKEN =
  process.env.KINTONE_CUSTOMER_API_TOKEN;

const CONTACT_APP_ID =
  process.env.KINTONE_CONTACT_APP_ID ||
  "1371";

const CONTACT_TOKEN =
  process.env.KINTONE_CONTACT_API_TOKEN;

const VISIT_APP_ID =
  process.env.KINTONE_VISIT_APP_ID ||
  "1350";

const VISIT_TOKEN =
  process.env.KINTONE_VISIT_API_TOKEN;

// ========================================
// 產業別代碼
// ========================================

const INDUSTRY_CODES = {
  製造業: "MFG",
  零售業: "RTL",
  金融業: "FIN",
  服務業: "SVC",
  醫療生技業: "BIO",
  社團法人: "NPO",
  物流業: "LOG",
  建築營造業: "CON",
  國營事業: "SOE",
  政教機關: "GOV",
  資訊業: "IT"
};

// ========================================
// 共用回應函式
// ========================================

function sendJson(
  res,
  statusCode,
  data
) {
  res.writeHead(statusCode, {
    "Content-Type":
      "application/json; charset=utf-8",

    "Cache-Control":
      "no-store"
  });

  res.end(
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

function sendText(
  res,
  statusCode,
  text
) {
  res.writeHead(statusCode, {
    "Content-Type":
      "text/plain; charset=utf-8",

    "Cache-Control":
      "no-store"
  });

  res.end(text);
}

// ========================================
// 讀取 Request Body
// ========================================

function readBody(req) {
  return new Promise(
    (resolve, reject) => {
      let body = "";

      req.on("data", chunk => {
        body +=
          chunk.toString("utf8");
      });

      req.on("end", () => {
        resolve(body);
      });

      req.on("error", reject);
    }
  );
}

// ========================================
// 檢查 Environment Variables
// ========================================

function validateEnvironment() {
  const requiredVariables = {
    KINTONE_DOMAIN:
      DOMAIN,

    KINTONE_CUSTOMER_API_TOKEN:
      CUSTOMER_TOKEN,

    KINTONE_CONTACT_API_TOKEN:
      CONTACT_TOKEN,

    KINTONE_VISIT_API_TOKEN:
      VISIT_TOKEN
  };

  const missing =
    Object.entries(
      requiredVariables
    )
      .filter(
        ([, value]) => !value
      )
      .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      "缺少 Environment Variable：" +
      missing.join("、")
    );
  }
}

// ========================================
// 組合多個 API Token
// ========================================

function combineTokens(
  ...tokens
) {
  return tokens
    .filter(Boolean)
    .join(",");
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
  validateEnvironment();

  let url =
    `${DOMAIN}${apiPath}`;

  if (queryParams) {
    url +=
      `?${queryParams.toString()}`;
  }

  const options = {
    method,

    headers: {
      "X-Cybozu-API-Token":
        token
    }
  };

  if (body) {
    options.headers[
      "Content-Type"
    ] = "application/json";

    options.body =
      JSON.stringify(body);
  }

  const response =
    await fetch(
      url,
      options
    );

  const rawText =
    await response.text();

  let data = {};

  try {
    data =
      rawText
        ? JSON.parse(rawText)
        : {};
  } catch (error) {
    data = {
      message:
        rawText ||
        "Kintone 回傳非 JSON 內容"
    };
  }

  if (!response.ok) {
    const error = new Error(
      data.message ||
      "Kintone API 執行失敗"
    );

    error.statusCode =
      response.status;

    error.details = data;

    throw error;
  }

  return data;
}

// ========================================
// 避免 Kintone Query 特殊字元問題
// ========================================

function escapeKintoneQueryValue(
  value
) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

// ========================================
// 正規化文字
// ========================================

function normalizeText(value) {
  return String(
    value || ""
  ).trim();
}

// ========================================
// 整理客戶資料
// ========================================

function formatCustomerRecord(
  record
) {
  return {
    recordId:
      record.$id?.value || "",

    company_id:
      record.company_id?.value || "",

    company_name:
      record.company_name?.value || "",

    company_phone:
      record.company_phone?.value || "",

    company_address:
      record.company_address?.value || "",

    industry:
      record.industry?.value || "",

    search_keywords:
      record.search_keywords?.value || "",

    customer_status:
      record.customer_status?.value || "",

    company_note:
      record.company_note?.value || ""
  };
}

// ========================================
// 整理聯絡人資料
// ========================================

function formatContactRecord(
  record
) {
  return {
    recordId:
      record.$id?.value || "",

    contact_id:
      record.contact_id?.value || "",

    company_id:
      record.company_id?.value || "",

    company_name:
      record.company_name?.value || "",

    industry:
      record.industry?.value || "",

    contact_name:
      record.contact_name?.value || "",

    department:
      record.department?.value || "",

    job_title:
      record.job_title?.value || "",

    email:
      record.email?.value || "",

    mobile:
      record.mobile?.value || "",

    phone:
      record.phone?.value || "",

    extension:
      record.extension?.value || "",

    contact_status:
      record.contact_status?.value || "",

    contact_note:
      record.contact_note?.value || ""
  };
}

// ========================================
// 依公司名稱或關鍵字模糊搜尋客戶
// ========================================

async function searchCustomers(
  keyword
) {
  const safeKeyword =
    escapeKintoneQueryValue(
      keyword
    );

  /*
    同時搜尋：

    1. company_name
    2. search_keywords

    例如：
    FUJIFILM → 富士軟片
    TSMC → 台積電
    富士 → 富士軟片
  */

  const query =
    `(` +
    `company_name like "${safeKeyword}" ` +
    `or ` +
    `search_keywords like "${safeKeyword}"` +
    `) ` +
    `order by company_name asc ` +
    `limit 20`;

  const params =
    new URLSearchParams({
      app: CUSTOMER_APP_ID,
      query
    });

  const data =
    await callKintone({
      token:
        CUSTOMER_TOKEN,

      method:
        "GET",

      apiPath:
        "/k/v1/records.json",

      queryParams:
        params
    });

  return (
    data.records || []
  ).map(
    formatCustomerRecord
  );
}

// ========================================
// 依統一編號查詢客戶
// ========================================

async function findCustomerById(
  companyId
) {
  const safeCompanyId =
    escapeKintoneQueryValue(
      companyId
    );

  const query =
    `company_id = "${safeCompanyId}" ` +
    `limit 1`;

  const params =
    new URLSearchParams({
      app: CUSTOMER_APP_ID,
      query
    });

  const data =
    await callKintone({
      token:
        CUSTOMER_TOKEN,

      method:
        "GET",

      apiPath:
        "/k/v1/records.json",

      queryParams:
        params
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
// 建立客戶
// ========================================

async function createCustomer(
  customerData
) {
  const record = {
    company_id: {
      value:
        customerData.company_id
    },

    company_name: {
      value:
        customerData.company_name
    },

    company_phone: {
      value:
        customerData.company_phone ||
        ""
    },

    company_address: {
      value:
        customerData.company_address ||
        ""
    },

    industry: {
      value:
        customerData.industry
    },

    search_keywords: {
      value:
        customerData.search_keywords ||
        ""
    },

    company_note: {
      value:
        customerData.company_note ||
        ""
    }
  };

  /*
    有傳入客戶狀態才寫入。
    沒有則使用 Kintone 欄位預設值。
  */

  if (
    customerData.customer_status
  ) {
    record.customer_status = {
      value:
        customerData.customer_status
    };
  }

  return await callKintone({
    token:
      CUSTOMER_TOKEN,

    method:
      "POST",

    apiPath:
      "/k/v1/record.json",

    body: {
      app:
        CUSTOMER_APP_ID,

      record
    }
  });
}

// ========================================
// 查詢公司旗下聯絡人
// ========================================

async function searchContactsByCompanyId(
  companyId
) {
  const safeCompanyId =
    escapeKintoneQueryValue(
      companyId
    );

  const query =
    `company_id = "${safeCompanyId}" ` +
    `order by contact_id asc ` +
    `limit 100`;

  const params =
    new URLSearchParams({
      app: CONTACT_APP_ID,
      query
    });

  const data =
    await callKintone({
      token:
        CONTACT_TOKEN,

      method:
        "GET",

      apiPath:
        "/k/v1/records.json",

      queryParams:
        params
    });

  return (
    data.records || []
  ).map(
    formatContactRecord
  );
}

// ========================================
// 依 Contact ID 查詢聯絡人
// ========================================

async function findContactById(
  contactId
) {
  const safeContactId =
    escapeKintoneQueryValue(
      contactId
    );

  const query =
    `contact_id = "${safeContactId}" ` +
    `limit 1`;

  const params =
    new URLSearchParams({
      app: CONTACT_APP_ID,
      query
    });

  const data =
    await callKintone({
      token:
        CONTACT_TOKEN,

      method:
        "GET",

      apiPath:
        "/k/v1/records.json",

      queryParams:
        params
    });

  if (
    !data.records ||
    data.records.length === 0
  ) {
    return null;
  }

  return formatContactRecord(
    data.records[0]
  );
}

// ========================================
// 產生下一個 Contact ID
// ========================================

async function generateNextContactId(
  customer
) {
  const companyId =
    normalizeText(
      customer.company_id
    );

  const industry =
    normalizeText(
      customer.industry
    );

  if (!companyId) {
    throw new Error(
      "客戶資料缺少統一編號"
    );
  }

  if (!industry) {
    throw new Error(
      "客戶資料尚未設定產業別"
    );
  }

  const industryCode =
    INDUSTRY_CODES[industry];

  if (!industryCode) {
    throw new Error(
      `尚未設定產業代碼：${industry}`
    );
  }

  const prefix =
    `${industryCode}-${companyId}-`;

  const safePrefix =
    escapeKintoneQueryValue(
      prefix
    );

  const query =
    `contact_id like "${safePrefix}" ` +
    `order by contact_id desc ` +
    `limit 100`;

  const params =
    new URLSearchParams({
      app: CONTACT_APP_ID,
      query
    });

  const data =
    await callKintone({
      token:
        CONTACT_TOKEN,

      method:
        "GET",

      apiPath:
        "/k/v1/records.json",

      queryParams:
        params
    });

  let maxSequence = 0;

  for (
    const record of
    data.records || []
  ) {
    const contactId =
      normalizeText(
        record.contact_id?.value
      );

    if (
      !contactId.startsWith(
        prefix
      )
    ) {
      continue;
    }

    const sequenceText =
      contactId.substring(
        prefix.length
      );

    const sequenceNumber =
      Number(sequenceText);

    if (
      Number.isInteger(
        sequenceNumber
      ) &&
      sequenceNumber >
        maxSequence
    ) {
      maxSequence =
        sequenceNumber;
    }
  }

  const nextSequence =
    String(
      maxSequence + 1
    ).padStart(
      3,
      "0"
    );

  return (
    `${industryCode}-` +
    `${companyId}-` +
    nextSequence
  );
}

// ========================================
// 判斷是否為 Contact ID 重複錯誤
// ========================================

function isDuplicateContactIdError(
  error
) {
  const detailsText =
    JSON.stringify(
      error.details || {}
    ).toLowerCase();

  const messageText =
    normalizeText(
      error.message
    ).toLowerCase();

  return (
    error.statusCode === 400 &&
    (
      detailsText.includes(
        "contact_id"
      ) ||
      detailsText.includes(
        "duplicate"
      ) ||
      detailsText.includes(
        "重複"
      ) ||
      messageText.includes(
        "contact_id"
      ) ||
      messageText.includes(
        "duplicate"
      ) ||
      messageText.includes(
        "重複"
      )
    )
  );
}

// ========================================
// 建立聯絡人
// 1371 的 company_id 會 Lookup 1349
// ========================================

async function createContact(
  customer,
  contactData
) {
  let lastError = null;

  /*
    若同一時間新增相同公司的聯絡人，
    有機會取得相同流水號。

    contact_id 已設定禁止重複值，
    因此最多重試 3 次。
  */

  for (
    let attempt = 1;
    attempt <= 3;
    attempt += 1
  ) {
    const contactId =
      await generateNextContactId(
        customer
      );

    try {
      await callKintone({
        /*
          CONTACT_TOKEN：
          新增 1371 聯絡人。

          CUSTOMER_TOKEN：
          允許 company_id Lookup
          讀取 1349 客戶資料。
        */

        token:
          combineTokens(
            CONTACT_TOKEN,
            CUSTOMER_TOKEN
          ),

        method:
          "POST",

        apiPath:
          "/k/v1/record.json",

        body: {
          app:
            CONTACT_APP_ID,

          record: {
            contact_id: {
              value:
                contactId
            },

            company_id: {
              value:
                customer.company_id,

              lookup:
                true
            },

            contact_name: {
              value:
                contactData.contact_name
            },

            department: {
              value:
                contactData.department ||
                ""
            },

            job_title: {
              value:
                contactData.job_title ||
                ""
            },

            email: {
              value:
                contactData.email ||
                ""
            },

            mobile: {
              value:
                contactData.mobile ||
                ""
            },

            phone: {
              value:
                contactData.phone ||
                customer.company_phone ||
                ""
            },

            extension: {
              value:
                contactData.extension ||
                ""
            },

            contact_note: {
              value:
                contactData.contact_note ||
                ""
            }
          }
        }
      });

      const createdContact =
        await findContactById(
          contactId
        );

      if (!createdContact) {
        throw new Error(
          "聯絡人已建立，但重新查詢不到資料"
        );
      }

      return createdContact;

    } catch (error) {
      lastError = error;

      console.error(
        `Create contact attempt ${attempt} failed:`,
        error.message,
        error.details || ""
      );

      /*
        只有 Contact ID 重複時才重新產號。
        Lookup、權限或欄位錯誤不重試。
      */

      if (
        !isDuplicateContactIdError(
          error
        )
      ) {
        throw error;
      }
    }
  }

  throw (
    lastError ||
    new Error(
      "聯絡人建立失敗"
    )
  );
}

// ========================================
// 建立拜訪紀錄
// 1350 使用兩個 Lookup
//
// company_id → Lookup 1349
// contact_id → Lookup 1371
// ========================================

async function createVisit(
  customer,
  contact,
  visitData
) {
  const record = {
    /*
      從 1349 帶入：
      company_name
      company_phone
    */

    company_id: {
      value:
        customer.company_id,

      lookup:
        true
    },

    /*
      從 1371 帶入：
      contact_name
      department
      job_title
      contact_email
      contact_mobile
    */

    contact_id: {
      value:
        contact.contact_id,

      lookup:
        true
    },

    visit_date: {
      value:
        visitData.visit_date
    },

    visit_type: {
      value:
        visitData.visit_type
    },

    visit_content: {
      value:
        visitData.visit_content
    },

    next_step: {
      value:
        visitData.next_step
    }
  };

  /*
    選填欄位有值才寫入。
  */

  if (
    visitData.next_followup_date
  ) {
    record.next_followup_date = {
      value:
        visitData.next_followup_date
    };
  }

  if (
    visitData.sales_stage
  ) {
    record.sales_stage = {
      value:
        visitData.sales_stage
    };
  }

  return await callKintone({
    /*
      VISIT_TOKEN：
      新增 1350。

      CUSTOMER_TOKEN：
      company_id Lookup 讀取 1349。

      CONTACT_TOKEN：
      contact_id Lookup 讀取 1371。
    */

    token:
      combineTokens(
        VISIT_TOKEN,
        CUSTOMER_TOKEN,
        CONTACT_TOKEN
      ),

    method:
      "POST",

    apiPath:
      "/k/v1/record.json",

    body: {
      app:
        VISIT_APP_ID,

      record
    }
  });
}

// ========================================
// 正規化客戶資料
// ========================================

function normalizeCustomerData(
  value
) {
  const source =
    value &&
    typeof value === "object"
      ? value
      : {};

  return {
    company_id:
      normalizeText(
        source.company_id
      ),

    company_name:
      normalizeText(
        source.company_name
      ),

    company_phone:
      normalizeText(
        source.company_phone
      ),

    company_address:
      normalizeText(
        source.company_address
      ),

    industry:
      normalizeText(
        source.industry
      ),

    search_keywords:
      normalizeText(
        source.search_keywords
      ),

    customer_status:
      normalizeText(
        source.customer_status
      ),

    company_note:
      normalizeText(
        source.company_note
      )
  };
}

// ========================================
// 正規化聯絡人資料
// ========================================

function normalizeContactData(
  value
) {
  const source =
    value &&
    typeof value === "object"
      ? value
      : {};

  return {
    contact_id:
      normalizeText(
        source.contact_id
      ),

    contact_name:
      normalizeText(
        source.contact_name
      ),

    department:
      normalizeText(
        source.department
      ),

    job_title:
      normalizeText(
        source.job_title
      ),

    email:
      normalizeText(
        source.email
      ),

    mobile:
      normalizeText(
        source.mobile
      ),

    phone:
      normalizeText(
        source.phone
      ),

    extension:
      normalizeText(
        source.extension
      ),

    contact_note:
      normalizeText(
        source.contact_note
      )
  };
}

// ========================================
// 正規化拜訪資料
// ========================================

function normalizeVisitData(
  value
) {
  const source =
    value &&
    typeof value === "object"
      ? value
      : {};

  return {
    visit_date:
      normalizeText(
        source.visit_date
      ),

    visit_type:
      normalizeText(
        source.visit_type
      ),

    visit_content:
      normalizeText(
        source.visit_content
      ),

    next_step:
      normalizeText(
        source.next_step
      ),

    next_followup_date:
      normalizeText(
        source.next_followup_date
      ),

    sales_stage:
      normalizeText(
        source.sales_stage
      )
  };
}

// ========================================
// HTTP Server
// ========================================

const server =
  http.createServer(
    async (req, res) => {
      try {
        const requestUrl =
          new URL(
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
          const htmlPath =
            path.join(
              __dirname,
              "visit-form.html"
            );

          const html =
            fs.readFileSync(
              htmlPath,
              "utf8"
            );

          res.writeHead(
            200,
            {
              "Content-Type":
                "text/html; charset=utf-8",

              "Cache-Control":
                "no-store"
            }
          );

          res.end(html);
          return;
        }

        // ----------------------------------
        // 健康檢查
        // ----------------------------------

        if (
          req.method === "GET" &&
          requestUrl.pathname ===
            "/health"
        ) {
          validateEnvironment();

          sendJson(
            res,
            200,
            {
              status:
                "ok",

              apps: {
                customer:
                  CUSTOMER_APP_ID,

                contact:
                  CONTACT_APP_ID,

                visit:
                  VISIT_APP_ID
              },

              lookup: {
                contactToCustomer:
                  true,

                visitToCustomer:
                  true,

                visitToContact:
                  true
              },

              customerSearch: {
                companyName:
                  true,

                keywords:
                  true
              }
            }
          );

          return;
        }

        // ----------------------------------
        // 搜尋客戶
        //
        // GET /api/customers?keyword=TSMC
        // GET /api/customers?keyword=FUJIFILM
        // GET /api/customers?keyword=台積
        // ----------------------------------

        if (
          req.method === "GET" &&
          requestUrl.pathname ===
            "/api/customers"
        ) {
          const keyword =
            normalizeText(
              requestUrl
                .searchParams
                .get("keyword")
            );

          if (!keyword) {
            sendJson(
              res,
              400,
              {
                success:
                  false,

                message:
                  "請輸入客戶公司名稱、英文名稱或關鍵字"
              }
            );

            return;
          }

          if (
            keyword.length < 2
          ) {
            sendJson(
              res,
              400,
              {
                success:
                  false,

                message:
                  "請至少輸入 2 個字"
              }
            );

            return;
          }

          const customers =
            await searchCustomers(
              keyword
            );

          sendJson(
            res,
            200,
            {
              success:
                true,

              keyword,

              found:
                customers.length > 0,

              count:
                customers.length,

              customers
            }
          );

          return;
        }

        // ----------------------------------
        // 查詢公司旗下聯絡人
        //
        // GET /api/contacts?companyId=03550014
        // ----------------------------------

        if (
          req.method === "GET" &&
          requestUrl.pathname ===
            "/api/contacts"
        ) {
          const companyId =
            normalizeText(
              requestUrl
                .searchParams
                .get("companyId")
            );

          if (!companyId) {
            sendJson(
              res,
              400,
              {
                success:
                  false,

                message:
                  "缺少統一編號"
              }
            );

            return;
          }

          const customer =
            await findCustomerById(
              companyId
            );

          if (!customer) {
            sendJson(
              res,
              404,
              {
                success:
                  false,

                message:
                  "找不到客戶資料"
              }
            );

            return;
          }

          const contacts =
            await searchContactsByCompanyId(
              companyId
            );

          sendJson(
            res,
            200,
            {
              success:
                true,

              customer,

              found:
                contacts.length > 0,

              count:
                contacts.length,

              contacts
            }
          );

          return;
        }

        // ----------------------------------
        // 建立拜訪紀錄
        //
        // POST /api/visit
        // ----------------------------------

        if (
          req.method === "POST" &&
          requestUrl.pathname ===
            "/api/visit"
        ) {
          const rawBody =
            await readBody(req);

          let requestData;

          try {
            requestData =
              JSON.parse(
                rawBody
              );
          } catch (error) {
            sendJson(
              res,
              400,
              {
                success:
                  false,

                message:
                  "送出的資料格式不正確"
              }
            );

            return;
          }

          const customerMode =
            normalizeText(
              requestData.customerMode
            );

          const contactMode =
            normalizeText(
              requestData.contactMode
            );

          const customerData =
            normalizeCustomerData(
              requestData.customer
            );

          const contactData =
            normalizeContactData(
              requestData.contact
            );

          const visitData =
            normalizeVisitData(
              requestData.visit
            );

          // --------------------------------
          // 檢查客戶與聯絡人模式
          // --------------------------------

          if (
            ![
              "existing",
              "new"
            ].includes(
              customerMode
            )
          ) {
            sendJson(
              res,
              400,
              {
                success:
                  false,

                message:
                  "請選擇既有客戶或建立新客戶"
              }
            );

            return;
          }

          if (
            ![
              "existing",
              "new"
            ].includes(
              contactMode
            )
          ) {
            sendJson(
              res,
              400,
              {
                success:
                  false,

                message:
                  "請選擇既有聯絡人或建立新聯絡人"
              }
            );

            return;
          }

          // --------------------------------
          // 檢查拜訪必填欄位
          // --------------------------------

          const missingVisitFields =
            [
              "visit_date",
              "visit_type",
              "visit_content",
              "next_step"
            ].filter(
              fieldName =>
                !visitData[
                  fieldName
                ]
            );

          if (
            missingVisitFields.length >
            0
          ) {
            sendJson(
              res,
              400,
              {
                success:
                  false,

                message:
                  "請填寫：" +
                  missingVisitFields
                    .join("、")
              }
            );

            return;
          }

          let customer;
          let customerCreated =
            false;

          // --------------------------------
          // 既有客戶
          // --------------------------------

          if (
            customerMode ===
            "existing"
          ) {
            if (
              !customerData.company_id
            ) {
              sendJson(
                res,
                400,
                {
                  success:
                    false,

                  message:
                    "缺少既有客戶統一編號"
                }
              );

              return;
            }

            customer =
              await findCustomerById(
                customerData.company_id
              );

            if (!customer) {
              sendJson(
                res,
                404,
                {
                  success:
                    false,

                  message:
                    "找不到所選擇的客戶，請重新搜尋"
                }
              );

              return;
            }
          }

          // --------------------------------
          // 新客戶
          // --------------------------------

          if (
            customerMode ===
            "new"
          ) {
            const missingCustomerFields =
              [
                "company_id",
                "company_name",
                "industry"
              ].filter(
                fieldName =>
                  !customerData[
                    fieldName
                  ]
              );

            if (
              missingCustomerFields
                .length > 0
            ) {
              sendJson(
                res,
                400,
                {
                  success:
                    false,

                  message:
                    "新客戶請填寫：" +
                    missingCustomerFields
                      .join("、")
                }
              );

              return;
            }

            const existingCustomer =
              await findCustomerById(
                customerData.company_id
              );

            if (
              existingCustomer
            ) {
              sendJson(
                res,
                409,
                {
                  success:
                    false,

                  message:
                    "此統一編號已存在，請重新搜尋並選擇既有客戶"
                }
              );

              return;
            }

            await createCustomer(
              customerData
            );

            customerCreated =
              true;

            /*
              新增後重新讀取 1349，
              確認 Lookup 來源已經存在。
            */

            customer =
              await findCustomerById(
                customerData.company_id
              );

            if (!customer) {
              throw new Error(
                "客戶已建立，但重新查詢不到資料"
              );
            }
          }

          let contact;
          let contactCreated =
            false;

          // --------------------------------
          // 既有聯絡人
          // --------------------------------

          if (
            contactMode ===
            "existing"
          ) {
            if (
              !contactData.contact_id
            ) {
              sendJson(
                res,
                400,
                {
                  success:
                    false,

                  message:
                    "缺少 Contact ID"
                }
              );

              return;
            }

            contact =
              await findContactById(
                contactData.contact_id
              );

            if (!contact) {
              sendJson(
                res,
                404,
                {
                  success:
                    false,

                  message:
                    "找不到所選擇的聯絡人，請重新選擇"
                }
              );

              return;
            }

            if (
              contact.company_id !==
              customer.company_id
            ) {
              sendJson(
                res,
                400,
                {
                  success:
                    false,

                  message:
                    "所選聯絡人不屬於目前客戶"
                }
              );

              return;
            }
          }

          // --------------------------------
          // 新聯絡人
          // --------------------------------

          if (
            contactMode ===
            "new"
          ) {
            if (
              !contactData.contact_name
            ) {
              sendJson(
                res,
                400,
                {
                  success:
                    false,

                  message:
                    "新聯絡人請填寫姓名"
                }
              );

              return;
            }

            contact =
              await createContact(
                customer,
                contactData
              );

            contactCreated =
              true;
          }

          // --------------------------------
          // 建立 1350 拜訪紀錄
          // --------------------------------

          const visitResult =
            await createVisit(
              customer,
              contact,
              visitData
            );

          sendJson(
            res,
            200,
            {
              success:
                true,

              message:
                "拜訪紀錄建立成功",

              customerCreated,
              contactCreated,

              customer,
              contact,

              visitRecordId:
                visitResult.id,

              revision:
                visitResult.revision
            }
          );

          return;
        }

        sendText(
          res,
          404,
          "Not Found"
        );

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
            success:
              false,

            message:
              error.message ||
              "系統發生錯誤",

            details:
              error.details || null
          }
        );
      }
    }
  );

// ========================================
// 啟動 Server
// ========================================

const port =
  process.env.PORT || 3000;

server.listen(
  port,
  () => {
    console.log(
      `Server running on port ${port}`
    );

    console.log(
      `Customer App: ${CUSTOMER_APP_ID}`
    );

    console.log(
      `Contact App: ${CONTACT_APP_ID}`
    );

    console.log(
      `Visit App: ${VISIT_APP_ID}`
    );

    console.log(
      "Customer search fields: company_name, search_keywords"
    );

    console.log(
      "Lookup flow: 1349 -> 1371 -> 1350"
    );
  }
);
