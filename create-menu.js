const jwt = require("jsonwebtoken");

const CLIENT_ID =
  process.env.LINEWORKS_CLIENT_ID;

const CLIENT_SECRET =
  process.env.LINEWORKS_CLIENT_SECRET;

const SERVICE_ACCOUNT =
  process.env.LINEWORKS_SERVICE_ACCOUNT;

const PRIVATE_KEY =
  process.env.LINEWORKS_PRIVATE_KEY
    .replace(/\\n/g, "\n");

const BOT_ID =
  process.env.LINEWORKS_BOT_ID;

const WOFF_URL =
  process.env.LINEWORKS_WOFF_URL;

async function getAccessToken() {

  const now =
    Math.floor(Date.now() / 1000);

  const assertion = jwt.sign(
    {
      iss: CLIENT_ID,
      sub: SERVICE_ACCOUNT,
      iat: now,
      exp: now + 3600
    },
    PRIVATE_KEY,
    {
      algorithm: "RS256"
    }
  );

  const body =
    new URLSearchParams();

  body.append(
    "grant_type",
    "urn:ietf:params:oauth:grant-type:jwt-bearer"
  );

  body.append(
    "client_id",
    CLIENT_ID
  );

  body.append(
    "client_secret",
    CLIENT_SECRET
  );

  body.append(
    "scope",
    "bot"
  );

  body.append(
    "assertion",
    assertion
  );

  const response =
    await fetch(
      "https://auth.worksmobile.com/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body: body.toString()
      }
    );

  const data =
    await response.json();

  return data.access_token;
}

async function main() {

  const accessToken =
    await getAccessToken();

  const response =
    await fetch(
      `https://www.worksapis.com/v1.0/bots/${BOT_ID}/persistentmenu`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          content: {
            actions: [
              {
                type: "uri",
                label:
                  "📝拜訪紀錄回報",
                uri:
                  WOFF_URL
              }
            ]
          }
        })
      }
    );

  const data =
    await response.text();

  console.log(data);
}

main().catch(console.error);
