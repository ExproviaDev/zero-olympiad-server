const supabase = require("../config/db.js");


class Quiz{
    static async find(){
        const {data, error}= await supabase.from('quizzes').select('*');
        console.log('Response Data:', data);
        console.log('Response Error:', error);
        if(error){
            throw error;
        }else{
            return data;
        }
    }
    static async findById(id){
        const {data, error}= await supabase.from('quizzes').select('*').eq('id', id).single();
        if(error){
            throw error;
        }else{
            return data;
        }
    }

    static async create(quizzes){
        const {data, error} = await supabase.from('quizzes').insert(quizzes).select().single();
        if(error){
            throw error;
        }else{
            return data;
        }
    }

    static async findByIdAndUpdate(id, quizzes){
        const{data, error} = await supabase.from("quizzes").update(quizzes).eq('id', id).select().single();
        if(error){
            throw error;
        }else{
            return data;
        }

    }

    static async findByIdAndDelete(id, quizzes){
        const {data, error} = await supabase.from("quizzes").delete().eq('id', id).select().single()
    }
}


module.exports=Quiz;