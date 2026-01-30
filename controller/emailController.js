const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const getEmailTemplate = (userName, sdgRole) => {
    // SDG Role অনুযায়ী সাবজেক্ট এবং বডি আলাদা করা
    const templates = {
        'climate_warrior': {
            subject: "Welcome Climate Warrior! 🌍 - Zero Olympiad",
            html: `<h1>Hi ${userName},</h1><p>You've joined as a <b>Climate Warrior</b>. Let's save the planet together!</p>`
        },
        'poverty_fighter': {
            subject: "Change Maker! 🤝 - Zero Olympiad",
            html: `<h1>Hi ${userName},</h1><p>Welcome to the <b>No Poverty</b> mission. Your contribution matters!</p>`
        },
        'default': {
            subject: "Welcome to Zero Olympiad! 🏆",
            html: `<h1>Hi ${userName},</h1><p>Thank you for registering for Zero Olympiad. We are excited to have you!</p>`
        }
    };

    return templates[sdgRole] || templates['default'];
};

exports.sendRegistrationEmail = async (userEmail, userName, sdgRole) => {
    try {
        const template = getEmailTemplate(userName, sdgRole);

        const data = await resend.emails.send({
            from: 'Zero Olympiad <onboarding@resend.dev>', // ডোমেইন ভেরিফাই করলে নিজের ইমেইল দিতে পারবে
            to: userEmail,
            subject: template.subject,
            html: template.html,
        });

        console.log(`Email sent to ${userEmail} for role ${sdgRole}`);
        return { success: true, data };
    } catch (error) {
        console.error("Email Error:", error.message);
        return { success: false, error: error.message };
    }
};