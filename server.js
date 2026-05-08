const express = require("express");
const cors = require('cors');
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const registrationRouter = require("./router/registrationRouter");
const authRouter = require("./router/auth")
const quizRouter = require('./router/quizRouter');
const adminRouter = require('./router/adminRouter')
const markRouter = require('./router/markRouter');
const videoRouter = require('./router/videoRouter');
const bkashRoutes = require('./router/bkashRouter');
const leaderboardRouter = require('./router/leaderboardRouter');
const announcementRouter = require('./router/announcementRouter');
const ambassadorRouter = require('./router/ambassadorRouter');
const invoiceRouter = require('./router/invoiceRouter');
// In production on Vercel, env vars are injected automatically.
// Keep dotenv only for local development.
if (!process.env.VERCEL) {
  require('dotenv').config();
}


const app = express();
const PORT = process.env.PORT || 4000;

// Cloudflare/Vercel proxy chain থেকে real client IP resolve করার জন্য
app.set("trust proxy", 1);

const getClientIp = (req) => {
  const ip =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip;

  return ipKeyGenerator(ip);
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.API_RATE_LIMIT_MAX || 1500),
  keyGenerator: getClientIp,
  // Skip preflight and login (login is intentionally unlimited).
  skip: (req) => req.method === "OPTIONS" || req.path === "/auth/login",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this IP, please try again later." }
});

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: Number(process.env.OTP_RATE_LIMIT_MAX || 10),
  keyGenerator: getClientIp,
  skip: (req) => req.method === "OPTIONS",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP requests, please try again later." }
});

const ALLOWED_ORIGINS = [
    'http://localhost:3000',     
    'https://z-o-frontend.vercel.app',
    'https://www.zeroolympiad.com',
    'https://zeroolympiad.com',
];

const EXTRA_ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (ALLOWED_ORIGINS.includes(origin) || EXTRA_ALLOWED_ORIGINS.includes(origin)) return true;

    // Allow Vercel preview deployments for this frontend family
    return /^https:\/\/(z-o-frontend|zero-olympiad-frontend)(-git-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
};

const corsOptions = {
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
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
app.use(express.json());

// Apply rate limiting
app.use("/api/", limiter);

// Specific limits for sensitive routes
app.use("/api/user/verify-otp", otpLimiter);
app.use("/api/user/resend-otp", otpLimiter);

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
app.use('/api/ambassadors', ambassadorRouter);
app.use('/api/invoice', invoiceRouter);


app.get("/", async (req, res)=>{
    const x = 'Zero Olympiad server is ok!';
    res.send(x);
})

// Vercel runs this file as a serverless function: do not bind a listening port there.
if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app