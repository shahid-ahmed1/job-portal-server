const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const cookiePerser = require('cookie-parser')
const app = express();
require('dotenv').config()

const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// app.use(cors({
//     origin: '*',  // Allow all origins
//     credentials: true,
//     methods: ['GET', 'POST', 'OPTIONS']
//   }));
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://job-portal-careare.web.app', 
        'https://job-portal-careare.firebaseapp.com' 
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json());
app.use(cookiePerser())
const logger = (req,res,next)=>{
    console.log('inside the logger')
    next()
}
const varifyToken = (req,res,next)=>{
   const token = req?.cookies?.token;
   if(!token){
    return res.status(401).send({message:'Unauthorized access'})
   }
   jwt.verify(token,process.env.DB_SECRET,(err,decoded) =>{
    if(err){
        return res.status(401).send({message:'UnAuthorized access'})
    }
    req.user = decoded;
    next()
   })
   
}
const uri = "mongodb+srv://Job_user:YXvxInoPBVvgEiuF@cluster0.nukrg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        // jobs related apis
        const jobsCollection = client.db('JobPortal').collection('jobs');
        const jobApplicationCollection = client.db('JobPortal').collection('job_applications');

        //  auth related apis
        app.post('/jwt',async(req,res)=>{
            const user = req.body;
            const token = jwt.sign(user,process.env.DB_SECRET,{expiresIn:'5h'})
            res
            .cookie('token',token,{
                httpOnly:true,
                secure:process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            }).send({success:true})
        })
         
        app.post('/logout',(req,res)=>{
          res
          .clearCookie('token',{
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({success:true})
        })

        // jobs related APIs
        app.get('/jobs',logger,  async (req, res) => {
            console.log('now inside the api callback')
            const email = req.query.email;
            let query = {};
            if (email) {
                query = { hr_email: email }
            }
            const cursor = jobsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get('/jobs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await jobsCollection.findOne(query);
            res.send(result);
        });

        app.post('/jobs', async (req, res) => {
            const newJob = req.body;
            const result = await jobsCollection.insertOne(newJob);
            res.send(result);
        })


        // job application apis
        // get all data, get one data, get some data [o, 1, many]
        
        app.get('/job-application',varifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { 
                appliEmail: email }
             if(req.user.email !== req.query.email){
                return res.status(403).send({message:'forbidden  access'})
             }
            
            const result = await jobApplicationCollection.find(query).toArray();
            
            // fokira way to aggregate data
            for (const application of result) {
                // console.log(application.job_id)
                const query1 = { _id: new ObjectId(application.
                    jobId) }
                const job = await jobsCollection.findOne(query1);
                if (job) {
                    application.title = job.title;
                    application.location = job.location;
                    application.company = job.company;
                    application.company_logo = job.company_logo;
                }
            }
            res.send(result);
        })

        // app.get('/job-applications/:id') ==> get a specific job application by id

        app.get('/job-applications/jobs/:job_id', async (req, res) => {
            const jobId = req.params.job_id;
            const query = { 
                jobId: jobId }
            const result = await jobApplicationCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/job-applications', async (req, res) => {
            const application = req.body;
            const result = await jobApplicationCollection.insertOne(application);

            // Not the best way (use aggregate) 
            // skip --> it
            const id = application.job_id;
            const query = { _id: new ObjectId(id) }
            const job = await jobsCollection.findOne(query);
            let newCount = 0;
            if (job?.applicationCount) {
                newCount = job.applicationCount + 1;
            }
            else {
                newCount = 1;
            }

            // now update the job info
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    applicationCount: newCount
                }
            }

            const updateResult = await jobsCollection.updateOne(filter, updatedDoc);

            res.send(result);
        });


        app.patch('/job-applications/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: data.status
                }
            }
            const result = await jobApplicationCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.options('*', cors());
app.get('/', (req, res) => {
    res.send('Job is falling from the sky')
})

app.listen(port, () => {
    console.log(`Job is waiting at: ${port}`)
})