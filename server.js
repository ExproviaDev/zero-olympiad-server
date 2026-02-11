const express = require("express");
const cors = require('cors');
const registrationRouter = require("./router/registrationRouter");
const authRouter = require("./router/auth")
const quizRouter = require('./router/quizRouter');
const adminRouter = require('./router/adminRouter')
const markRouter = require('./router/markRouter');
const videoRouter = require('./router/videoRouter');
const bkashRoutes = require('./router/bkashRouter');
const leaderboardRouter = require('./router/leaderboardRouter');
const announcementRouter = require('./router/announcementRouter');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGINS = [
    'http://localhost:3000',     
    'https://z-o-frontend.vercel.app',
    'https://zeroolympiad.faatihaaayat.com',
];
const corsOptions = {
    origin: (origin, callback) => {
        if (ALLOWED_ORIGINS.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            console.log("Blocked by CORS:", origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions)); 
app.options(/.*/, cors(corsOptions));
app.use(express.json());

app.use('/api/user', registrationRouter); 
app.use('/api/auth', authRouter);
app.use('/api/admin', quizRouter);
app.use('/api/admin', adminRouter);
app.use('/api/mark', markRouter);
app.use('/api/video', videoRouter);
app.use('/api/bkash', bkashRoutes);
app.use('/api/leaderboard', leaderboardRouter);
// Announcement Routes
app.use('/api/announcement', announcementRouter);


app.get("/", async (req, res)=>{
    const x = 'Zero Olympiad server is ok!';
    res.send(x);
})

// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


module.exports = app