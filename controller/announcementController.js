const supabase = require('../config/db');
const sql = require('../config/pg');

// --- Create Announcement ---
exports.createAnnouncement = async (req, res) => {
    try {
        if (sql) {
            const { title, fullDescription, date } = req.body;
            const rows = await sql`
                INSERT INTO announcements (title, full_description, date)
                VALUES (${title}, ${fullDescription}, ${date})
                RETURNING *
            `;
            return res.status(201).json({ message: "Announcement created successfully", data: rows });
        }

        // banner এবং description বাদ দেওয়া হয়েছে
        const { title, fullDescription, date } = req.body;

        const { data, error } = await supabase
            .from('announcements')
            .insert([
                { 
                    title, 
                    full_description: fullDescription, // DB column mapping
                    date 
                }
            ])
            .select();

        if (error) throw error;

        res.status(201).json({ message: "Announcement created successfully", data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Get All Announcements ---
exports.getAllAnnouncements = async (req, res) => {
    try {
        if (sql) {
            const rows = await sql`
                SELECT id, title, full_description, date
                FROM announcements
                ORDER BY id DESC
            `;
            return res.status(200).json(rows.map((item) => ({
                id: item.id,
                title: item.title,
                fullDescription: item.full_description,
                date: item.date,
            })));
        }

        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        const formattedData = data.map(item => ({
            id: item.id,
            title: item.title,
            fullDescription: item.full_description,
            date: item.date
        }));

        res.status(200).json(formattedData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Update Announcement ---
exports.updateAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, fullDescription, date } = req.body;

        if (sql) {
            const rows = await sql`
                UPDATE announcements
                SET title = ${title}, full_description = ${fullDescription}, date = ${date}
                WHERE id = ${id}
                RETURNING *
            `;
            return res.status(200).json({ message: "Announcement updated successfully", data: rows });
        }

        const { data, error } = await supabase
            .from('announcements')
            .update({ 
                title, 
                full_description: fullDescription, 
                date 
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.status(200).json({ message: "Announcement updated successfully", data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Delete Announcement ---
exports.deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;

        if (sql) {
            await sql`DELETE FROM announcements WHERE id = ${id}`;
            return res.status(200).json({ message: "Announcement deleted successfully" });
        }

        const { error } = await supabase
            .from('announcements')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({ message: "Announcement deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};