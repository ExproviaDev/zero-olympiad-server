const express = require("express");
const cors = require('cors');
const registrationRouter = require("./router/registrationRouter");
const authRouter = require("./router/auth")
const quizRouter = require('./router/quizRouter');
const adminRouter = require('./router/adminRouter')
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGINS = [
    'http://localhost:3000',     
    'https://z-o-frontend.vercel.app',
];

const corsOptions = {
    origin: ALLOWED_ORIGINS, 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions)); 

app.use(express.json());

app.use('/api/user', registrationRouter); 
app.use('/api/auth', authRouter);
app.use('/api/admin', quizRouter);
app.use('/api/admin', adminRouter);



app.get("/", async (req, res)=>{
    const x = 'Zero Olympiad server is ok!';
    res.send(x);
})

// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


module.exports = app