const supabase = require("../config/db")
const sql = require("../config/pg")
const express = require('express');
const router = express.Router();

router.use(express.json());

// --- Logging Helpers ---
const genRequestId = () => `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const maskEmail = (email) => {
    if (!email || typeof email !== "string") return email;
    const [local, domain] = email.split("@");
    if (!domain) return email;
    const visible = local.slice(0, 2);
    return `${visible}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

const logStep = (rid, step, data = {}) => {
    console.log(`[auth/login][${rid}] ${step}`, data);
};
// --- SDG Number Calculation Helper ---
const calculateAssignedSDG = (level) => {
    const l = level ? level.trim() : "";

    if (l.includes("Class 5") || l.includes("Taisir")) return 1;
    if (l.includes("Class 6") || l.includes("Mizan")) return 2;
    if (l.includes("Class 7") || l.includes("Nahbemir")) return 3;
    if (l.includes("Class 8") || l.includes("Hidayatunnah")) return 4;
    if (l.includes("Class 9") || l.includes("Kafiya & Bekaya")) return 5;
    if (l.includes("Class 10")) return 6;
    if (l.includes("SSC") || l.includes("Dakhil Candidate")) return 7;
    if (l.includes("Class 11") || l.includes("Jalalayn")) return 8;
    if (l.includes("Class 12")) return 9;
    if (l.includes("HSC") || l.includes("Alim Candidate")) return 10;
    if (l.includes("Admission Candidate") || l.includes("Musannif")) return 11;

    // University & Diploma Mapping
    if (l.includes("1st Year") || l.includes("Fazil") || l.includes("Mishkat")) return 12;
    if (l.includes("2nd Year")) return 13;
    if (l.includes("3rd Year")) return 14;
    if (l.includes("4th Year")) return 15;
    if (l.includes("5th Year") || l.includes("Kamil") || l.includes("Dawrah")) return 16;
    if (l.includes("Postgraduate")) return 17;

    return 0;
};

const isAdmissionCandidateLevel = (level) => {
    const l = level ? level.trim() : "";
    return l.includes("Admission Candidate") || l.includes("Musannif");
};

router.post('/login', async (req, res) => {
    const rid = genRequestId();
    const tStart = Date.now();

    const rawEmail = req.body?.email;
    const rawPassword = req.body?.password;
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;
    const password = rawPassword;

    logStep(rid, "request_received", {
        email_masked: maskEmail(email),
        has_password: !!password,
    });

    if (!email || !password) {
        logStep(rid, "validation_failed", { has_email: !!email, has_password: !!password });
        return res.status(400).json({ message: "Email and password are required." });
    }

    try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

        if (authError) {
            logStep(rid, "auth_error", {
                error_message: authError.message,
                status: authError.status,
                total_ms: Date.now() - tStart,
            });
            return res.status(401).json({ message: authError.message });
        }

        const token = authData?.session?.access_token;
        if (!token) {
            logStep(rid, "token_missing", { total_ms: Date.now() - tStart });
            return res.status(500).json({ message: "Login session token missing." });
        }

        logStep(rid, "success", {
            user_id: authData.user.id,
            email_masked: maskEmail(email),
            total_ms: Date.now() - tStart,
        });

        res.status(200).json({
            message: "Login successful!",
            token,
            user: {
                id: authData.user.id,
                email: authData.user.email,
            },
        });

    } catch (err) {
        console.error(`[auth/login][${rid}] unhandled_error`, {
            message: err?.message,
            email_masked: maskEmail(email),
            total_ms: Date.now() - tStart,
        });
        res.status(500).json({ message: 'Internal server error occurred.' });
    }
});

router.get('/me', async (req, res) => {
    const rid = genRequestId();
    const tStart = Date.now();
    console.log(`[auth/me][${rid}] request_received`, {
        ip: req.ip || req.headers["x-forwarded-for"],
        user_agent: req.headers["user-agent"],
        has_auth_header: !!req.headers.authorization,
        timestamp: new Date().toISOString(),
    });

    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            console.log(`[auth/me][${rid}] no_token`, { elapsed_ms: Date.now() - tStart });
            return res.status(401).json({ isAuthenticated: false });
        }
        console.log(`[auth/me][${rid}] token`, { token });

        const tAuth = Date.now();
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        console.log(`[auth/me][${rid}] supabase_get_user`, {
            elapsed_ms: Date.now() - tAuth,
            has_user: !!userData?.user,
            has_error: !!userError,
            error_message: userError?.message,
            userData: userData,
        });

        if (userError || !userData?.user) return res.status(401).json({ isAuthenticated: false });

        const userId = userData.user.id;
        console.log(`[auth/me][${rid}] userId`, { userId });
        if (sql) {
            const tPg = Date.now();
            const rows = await sql`
                SELECT *
                FROM user_profiles
                WHERE user_id = ${userId}
                LIMIT 1
            `;
            console.log(`[auth/me][${rid}] pg_profile_select`, {
                elapsed_ms: Date.now() - tPg,
                rows_returned: rows.length,
                user_id: userId,
            });
            if (!rows[0]) {
                console.warn(`[auth/me][${rid}] profile_not_found`, { user_id: userId });
                return res.status(404).json({ message: 'Profile not found' });
            }
            const profileRow = rows[0];
            const profileLevel = profileRow?.grade_level || profileRow?.current_level || "";
            const shouldBeAchiever = isAdmissionCandidateLevel(profileLevel);
            if (shouldBeAchiever && profileRow?.sdg_role !== "SDG Achiever") {
                await sql`
                    UPDATE user_profiles
                    SET sdg_role = 'SDG Achiever'
                    WHERE user_id = ${userId}
                `;
                profileRow.sdg_role = "SDG Achiever";
            }
            console.log(`[auth/me][${rid}] success`, {
                total_ms: Date.now() - tStart,
                user_id: userId,
                role: profileRow.role,
            });
            return res.status(200).json({ isAuthenticated: true, user: profileRow });
        }

        const tSb = Date.now();
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();
        console.log(`[auth/me][${rid}] supabase_profile_select`, {
            elapsed_ms: Date.now() - tSb,
            has_data: !!profile,
            has_error: !!profileError,
            error_code: profileError?.code,
            error_message: profileError?.message,
            profile: profile,
        });

        if (profileError) return res.status(404).json({ message: "Profile not found" });

        const profileLevel = profile?.grade_level || profile?.current_level || "";
        const shouldBeAchiever = isAdmissionCandidateLevel(profileLevel);
        if (shouldBeAchiever && profile?.sdg_role !== "SDG Achiever") {
            const { error: fixRoleError } = await supabase
                .from('user_profiles')
                .update({ sdg_role: "SDG Achiever" })
                .eq('user_id', userId);
            if (!fixRoleError) {
                profile.sdg_role = "SDG Achiever";
            }
        }

        console.log(`[auth/me][${rid}] success`, {
            total_ms: Date.now() - tStart,
            user_id: userId,
            role: profile?.role,
            assigned_sdg_number: profile?.assigned_sdg_number,
        });
        res.status(200).json({
            isAuthenticated: true,
            user: profile
        });
    } catch (err) {
        console.error(`[auth/me][${rid}] unhandled_error`, {
            message: err?.message,
            stack: err?.stack,
            total_ms: Date.now() - tStart,
        });
        res.status(401).json({ isAuthenticated: false });
    }
});


router.put('/update-profile', async (req, res) => {
    const rid = genRequestId();
    const tStart = Date.now();
    console.log(`[auth/update-profile][${rid}] request_received`, {
        ip: req.ip || req.headers["x-forwarded-for"],
        has_auth_header: !!req.headers.authorization,
        body_keys: req.body ? Object.keys(req.body) : [],
        timestamp: new Date().toISOString(),
    });

    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];

        if (!token) {
            console.log(`[auth/update-profile][${rid}] no_token`);
            return res.status(401).json({ error: "No token provided" });
        }

        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData?.user) {
            console.warn(`[auth/update-profile][${rid}] invalid_token`, {
                error_message: userError?.message,
            });
            return res.status(401).json({ error: "Invalid token" });
        }
        const userId = userData.user.id;

        if (!userId) {
            console.warn(`[auth/update-profile][${rid}] no_user_id_in_token`);
            return res.status(401).json({ error: "Unauthorized: User ID not found in token" });
        }

        const updates = { ...req.body };
        console.log(`[auth/update-profile][${rid}] processing`, {
            user_id: userId,
            update_keys: Object.keys(updates),
            grade_level_changed: !!updates.grade_level,
        });

        // ১. যদি grade_level পরিবর্তন হয়, তাহলে রোল পুনরায় ক্যালকুলেট করা হবে
        if (updates.grade_level) {
            const assignedSDGNumber = calculateAssignedSDG(updates.grade_level);
            let sdgRole = "General Member";

            if (assignedSDGNumber >= 1 && assignedSDGNumber <= 4) {
                sdgRole = "SDG Activist";
            } else if (assignedSDGNumber >= 5 && assignedSDGNumber <= 10) {
                sdgRole = "SDG Ambassador";
            } else if (assignedSDGNumber >= 11 && assignedSDGNumber <= 17) {
                sdgRole = "SDG Achiever";
            }

            updates.assigned_sdg_number = assignedSDGNumber;
            updates.sdg_role = sdgRole;
            updates.current_level = updates.grade_level; // current_level ও সিঙ্ক করা হলো
        }

        // ২. সেনসিটিভ ডাটা রিমুভ করা
        delete updates.email;
        delete updates.user_id;
        delete updates.id;

        if (sql) {
            const keys = Object.keys(updates);
            if (keys.length === 0) {
                console.log(`[auth/update-profile][${rid}] no_keys_to_update`);
                return res.json({ message: "Profile updated successfully", user: null });
            }
            const tPg = Date.now();
            const rows = await sql`
                UPDATE user_profiles SET ${sql(updates, ...keys)}
                WHERE user_id = ${userId}
                RETURNING *
            `;
            console.log(`[auth/update-profile][${rid}] pg_update_done`, {
                elapsed_ms: Date.now() - tPg,
                total_ms: Date.now() - tStart,
                rows_updated: rows.length,
                user_id: userId,
            });
            return res.json({ message: "Profile updated successfully", user: rows[0] });
        }

        const tSb = Date.now();
        const { data, error } = await supabase
            .from('user_profiles')
            .update(updates)
            .eq('user_id', userId)
            .select();

        console.log(`[auth/update-profile][${rid}] supabase_update_done`, {
            elapsed_ms: Date.now() - tSb,
            total_ms: Date.now() - tStart,
            has_data: !!data,
            rows_updated: data?.length || 0,
            has_error: !!error,
            error_message: error?.message,
        });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ message: "Profile updated successfully", user: data[0] });
    } catch (err) {
        console.error(`[auth/update-profile][${rid}] unhandled_error`, {
            message: err?.message,
            name: err?.name,
            stack: err?.stack,
            total_ms: Date.now() - tStart,
        });
        res.status(401).json({ error: "Invalid Token" });
    }
});

module.exports = router;