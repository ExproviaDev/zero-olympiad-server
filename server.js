const express = require("express");
const quizRouter = require("./router/quizRouter");
const serverless = require('serverless-http');
const app = express();


const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use('/', quizRouter);



app.get("/", async (req, res)=>{
  const x = 'server is running successfully';
  res.send(x);
})
app.listen(PORT, ()=>{
  console.log(`server is running on port: ${PORT}`);
})

module.exports.app = serverless(app);