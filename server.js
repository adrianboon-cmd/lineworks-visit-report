const http = require("http");
const fs = require("fs");

const server = http.createServer((req,res)=>{

 if(req.url==="/"){

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
