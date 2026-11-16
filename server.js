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

const WOFF_ID =
  process.env.LINEWORKS_WOFF_ID;

// ========================================
// 固定設定
// ========================================

const AVAILABLE_MODES = [
  "visit",
  "customer"
];

const DEFAULT_MODE =
  "visit";

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

const CUSTOMER_STATUSES = [
  "潛在客戶",
  "洽談中",
  "既有客戶",
  "停止追蹤"
];

// ========================================
// 共用回應
// ========================================

function sendJson(
  res,
  statusCode,
  data
) {
  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store"
    }
  );

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
  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "text/plain; charset=utf-8",

      "Cache-Control":
        "no-store"
    }
  );

  res.end(text);
}

// ========================================
// Request Body
// ========================================

function readBody(req) {
  return new Promise(
    (resolve, reject) => {
      let body = "";

      req.on(
        "data",
        chunk => {
          body +=
            chunk.toString("utf8");
        }
      );

      req.on(
        "end",
        () => {
          resolve(body);
        }
      );

      req.on(
        "error",
        reject
      );
    }
  );
}

// ========================================
// Environment 檢查
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
      VISIT_TOKEN,

    LINEWORKS_WOFF_ID:
      WOFF_ID
  };

  const missing =
    Object.entries(
      requiredVariables
    )
      .filter(
        ([, value]) => !value
      )
      .map(
        ([key]) => key
      );

  if (
    missing.length > 0
  ) {
    throw new Error(
      "缺少 Environment Variable：" +
      missing.join("、")
    );
  }
}

// ========================================
// 共用工具
// ========================================

function normalizeText(value) {
  return String(
    value || ""
  ).trim();
}

function combineTokens(
  ...tokens
) {
  return tokens
    .filter(Boolean)
    .join(",");
}

function escapeKintoneQueryValue(
  value
) {
  return String(value)
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /"/g,
      '\\"'
    );
}

function normalizeMode(mode) {
  const value =
    normalizeText(mode)
      .toLowerCase();

  if (
    AVAILABLE_MODES.includes(
      value
    )
  ) {
    return value;
  }

  return DEFAULT_MODE;
}

// ========================================
// Kintone API 共用呼叫
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
    ] =
      "application/json";

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
    const error =
      new Error(
        data.message ||
        "Kintone API 執行失敗"
      );

    error.statusCode =
      response.status;

    error.details =
      data;

    throw error;
  }

  return data;
}

// ========================================
// 資料格式化
// ========================================

function formatCustomerRecord(
  record
) {
  return {
    recordId:
      record.$id?.value ||
      "",

    company_id:
      record.company_id?.value ||
      "",

    company_name:
      record.company_name?.value ||
      "",

    company_phone:
      record.company_phone?.value ||
      "",

    company_address:
      record.company_address?.value ||
      "",

    industry:
      record.industry?.value ||
      "",

    search_keywords:
      record.search_keywords?.value ||
      "",

    customer_status:
      record.customer_status?.value ||
      "",

    company_note:
      record.company_note?.value ||
      ""
  };
}

function formatContactRecord(
  record
) {
  return {
    recordId:
      record.$id?.value ||
      "",

    contact_id:
      record.contact_id?.value ||
      "",

    company_id:
      record.company_id?.value ||
      "",

    company_name:
      record.company_name?.value ||
      "",

    industry:
      record.industry?.value ||
      "",

    contact_name:
      record.contact_name?.value ||
      "",

    department:
      record.department?.value ||
      "",

    job_title:
      record.job_title?.value ||
      "",

    email:
      record.email?.value ||
      "",

    mobile:
      record.mobile?.value ||
      "",

    phone:
      record.phone?.value ||
      "",

    extension:
      record.extension?.value ||
      "",

    contact_status:
      record.contact_status?.value ||
      "",

    contact_note:
      record.contact_note?.value ||
      ""
  };
}

// ========================================
// 客戶查詢
// ========================================

async function searchCustomers(
  keyword
) {
  const safeKeyword =
    escapeKintoneQueryValue(
      keyword
    );

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
      app:
        CUSTOMER_APP_ID,

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
      app:
        CUSTOMER_APP_ID,

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

    customer_status: {
      value:
        customerData.customer_status
    },

    company_note: {
      value:
        customerData.company_note ||
        ""
    }
  };

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
// 聯絡人查詢
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
      app:
        CONTACT_APP_ID,

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
      app:
        CONTACT_APP_ID,

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
// Contact ID
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
    INDUSTRY_CODES[
      industry
    ];

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
      app:
        CONTACT_APP_ID,

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

  let maxSequence =
    0;

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
      Number(
        sequenceText
      );

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

  return (
    `${prefix}` +
    String(
      maxSequence + 1
    ).padStart(
      3,
      "0"
    )
  );
}

function isDuplicateContactIdError(
  error
) {
  const detail =
    JSON.stringify(
      error.details || {}
    ).toLowerCase();

  const message =
    normalizeText(
      error.message
    ).toLowerCase();

  return (
    error.statusCode === 400 &&
    (
      detail.includes(
        "contact_id"
      ) ||
      detail.includes(
        "duplicate"
      ) ||
      detail.includes(
        "重複"
      ) ||
      message.includes(
        "contact_id"
      ) ||
      message.includes(
        "duplicate"
      ) ||
      message.includes(
        "重複"
      )
    )
  );
}

// ========================================
// 建立聯絡人
// ========================================

async function createContact(
  customer,
  contactData
) {
  let lastError =
    null;

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
      lastError =
        error;

      console.error(
        `Create contact attempt ${attempt} failed:`,
        error.message,
        error.details || ""
      );

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
// ========================================

async function createVisit(
  customer,
  contact,
  visitData
) {
  const record = {
    company_id: {
      value:
        customer.company_id,

      lookup:
        true
    },

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
// Request Data 正規化
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
        // 同一份 WOFF HTML
        //
        // /?mode=visit
        // /?mode=customer
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
        // Health
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

              lineworks: {
                woffConfigured:
                  Boolean(
                    WOFF_ID
                  )
              },

              modes: {
                default:
                  DEFAULT_MODE,

                available:
                  AVAILABLE_MODES
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
        // WOFF 前端設定
        //
        // GET /api/config?mode=customer
        // ----------------------------------

        if (
          req.method === "GET" &&
          requestUrl.pathname ===
            "/api/config"
        ) {
          validateEnvironment();

          const requestedMode =
            requestUrl
              .searchParams
              .get("mode");

          sendJson(
            res,
            200,
            {
              success:
                true,

              woffId:
                WOFF_ID,

              mode:
                normalizeMode(
                  requestedMode
                ),

              defaultMode:
                DEFAULT_MODE,

              availableModes:
                AVAILABLE_MODES
            }
          );

          return;
        }

        // ----------------------------------
        // 搜尋客戶
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
        // 單一客戶完整資料
        //
        // 給 mode=customer 使用
        //
        // GET /api/customer-detail
        // ?companyId=03550014
        // ----------------------------------

        if (
          req.method === "GET" &&
          requestUrl.pathname ===
            "/api/customer-detail"
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

              contactCount:
                contacts.length,

              contacts
            }
          );

          return;
        }

        // ----------------------------------
        // 指定公司的聯絡人
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

          // 既有客戶

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

          // 新客戶

          if (
            customerMode ===
            "new"
          ) {
            const missingCustomerFields =
              [
                "company_id",
                "company_name",
                "industry",
                "customer_status"
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

            if (
              !CUSTOMER_STATUSES.includes(
                customerData.customer_status
              )
            ) {
              sendJson(
                res,
                400,
                {
                  success:
                    false,

                  message:
                    "客戶狀態選項不正確"
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

          // 既有聯絡人

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

          // 新聯絡人

          if (
            contactMode === "new"
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
              error.details ||
              null
          }
        );
      }
    }
  );

// ========================================
// 啟動 Server
// ========================================

const port =
  process.env.PORT ||
  3000;

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
      `WOFF configured: ${Boolean(WOFF_ID)}`
    );

    console.log(
      `Available modes: ${AVAILABLE_MODES.join(", ")}`
    );

    console.log(
      "Customer search fields: company_name, search_keywords"
    );

    console.log(
      "Lookup flow: 1349 -> 1371 -> 1350"
    );
  }
);
