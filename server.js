const express = require("express");
const quizRouter = require("./router/quizRouter");
const cors = require('cors');
const registrationRouter = require("./router/registrationRouter");
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 4000;

const corsOptions = {
    origin: 'http://localhost:3000', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions)); 

app.use(express.json());

app.use('/api/auth', registrationRouter); 
app.use('/', quizRouter);



app.get("/", async (req, res)=>{
    const x = 'Zero Olympiad server is ok!';
    res.send(x);
})

// app.listen(PORT, ()=>{
//     console.log(`server is running on port: ${PORT}`);
// })

// module.exports.app = serverless(app);

module.exports = app