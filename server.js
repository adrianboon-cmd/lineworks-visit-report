const http = require("http");
const fs = require("fs");

const DOMAIN = process.env.KINTONE_DOMAIN;
const APP_ID = process.env.KINTONE_VISIT_APP_ID;
const TOKEN = process.env.KINTONE_API_TOKEN;

const server = http.createServer((req,res)=>{

if(req.url === "/api/visit" && req.method === "POST"){

 let body = "";

 req.on("data", chunk => {
   body += chunk.toString();
 });

 req.on("end", async ()=>{

   try{

     const formData = JSON.parse(body);

     const response = await fetch(
       `${DOMAIN}/k/v1/record.json`,
       {
         method:"POST",
         headers:{
           "Content-Type":"application/json",
           "X-Cybozu-API-Token":TOKEN
         },
         body:JSON.stringify({
           app: APP_ID,
           record:{
             統一編號:{
               value: formData.統一編號
             },
             客戶名稱:{
               value: formData.客戶名稱
             },
             拜訪日期:{
               value: formData.拜訪日期
             },
             拜訪對象:{
               value: formData.拜訪對象
             },
             電話:{
               value: formData.電話
             },
             拜訪內容:{
               value: formData.拜訪內容
             },
             下一步:{
               value: formData.下一步
             }
           }
         })
       }
     );

     const result = await response.json();

     res.writeHead(200,{
       "Content-Type":"application/json"
     });

     res.end(JSON.stringify(result));

   }
   catch(error){

     console.error(error);

     res.writeHead(500);

     res.end("error");

   }

 });

 return;
}

   const html = fs.readFileSync(
      "visit-form.html",
      "utf8"
   );

   res.writeHead(200,{
      "Content-Type":"text/html;charset=utf-8"
   });

   res.end(html);

   return;
 }

 res.writeHead(404);
 res.end("Not Found");

});

const port = process.env.PORT || 3000;

server.listen(port,()=>{
 console.log(`Server running on ${port}`);
});
