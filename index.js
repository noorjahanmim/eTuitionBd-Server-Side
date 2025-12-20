const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');
const port = process.env.PORT || 3000

// middleware
app.use(express.json());
app.use(cors());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hdnectc.mongodb.net/?appName=Cluster0`;

// Create a MongoClient 
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
    const db = client.db('eTuitionBdDB');
    const usersCollection = db.collection('users');
    const tuitionCollection = db.collection('tuition');
    const applicationsCollection = db.collection('applications');
    const paymentsCollection = db.collection('payments');

    // JWT Related APIs

    // Home page related APIs
    // Latest Tuition
    app.get('/latest-tuitions', async (req, res) => {
      const result = await tuitionCollection.find({ status: "Approved" }).sort({ createdAt: -1 }).limit(4).toArray();
      res.send(result);
    });

    // Meet Our Top Tutors
      app.get('/latest-tutors', async (req, res) => {
        const result = await usersCollection
          .find({ role: "Tutor" }).sort({ createdAt: -1 }).limit(4).toArray();
        res.send(result);
      });

  // All Tuition Page
    // All tuition
        // GET: All tuitions 
    app.get("/tuitions", async (req, res) => {
      try {
        const { studentEmail } = req.query;
        let query = {};
        if (studentEmail) {
          query.studentEmail = studentEmail;
        }
        const result = await tuitionCollection.find(query).sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching tuitions:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // GET: Single tuition by ID
    // app.get("/tuitions/:id", async (req, res) => {
    //   try {
    //     const id = req.params.id;
    //     const result = await tuitionCollection.findOne({ _id: new ObjectId(id) });
    //     if (!result) return res.status(404).send({ message: "Tuition not found" });
    //     res.send(result);
    //   } catch (error) {
    //     console.error("Error fetching tuition:", error);
    //     res.status(500).send({ message: "Internal Server Error" });
    //   }
    // });

        // tuition details by id
    app.get('/tuitions/:id', async (req, res) => {
      const id = req.params.id;
      const tuition = await tuitionCollection.findOne({ _id: new ObjectId(id) });
      if (!tuition) {
        return res.status(404).send({ message: "Tuition not found" });
      }
      res.send(tuition);
    });

    // Apply tutor
    app.post('/apply-tuition', async (req, res) => {
      const application = req.body;

      // Add metadata
      application.appliedAt = new Date();
      application.status = "Pending";

      // Ensure tuitionId is ObjectId
      try {
        application.tuitionId = new ObjectId(application.tuitionId);
      } catch (err) {
        return res.send({ success: false, message: "Invalid tuition ID format." });
      }

      // Check for duplicate
      const existing = await applicationsCollection.findOne({
        tuitionId: application.tuitionId,
        tutorEmail: application.tutorEmail
      });

      if (existing) {
        return res.send({
          success: false,
          message: "You have already applied for this tuition."
        });
      }

      // Insert new application
      const result = await applicationsCollection.insertOne(application);
      res.send({
        success: true,
        message: "Application submitted successfully!",
        insertedId: result.insertedId
      });
    });

    // Sorting (All tuition page)
    app.get('/tuitions', async (req, res) => {
      const { subject, location, className, sort, page = 1, limit = 6 } = req.query;

      let query = { status: "Approved" };

      if (subject) query.subject = { $regex: subject, $options: "i" };
      if (location) query.location = { $regex: location, $options: "i" };
      if (className) query.class = className;

      let cursor = tuitionCollection.find(query);

      if (sort === "budget") cursor = cursor.sort({ budget: 1 });
      if (sort === "date") cursor = cursor.sort({ createdAt: -1 });

      const result = await cursor
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .toArray();

      res.send(result);
    });


    // ✅ Tutor: Apply to Tuition (Dup )
    // app.post('/applications', async (req, res) => {
    //   const application = req.body;

    //   if (!application) {
    //     return res.status(400).send({ message: "Application data missing" });
    //   }

    //   application.createdAt = new Date();
    //   application.status = "Pending";

    //   const result = await applicationsCollection.insertOne(application);
    //   res.send(result);
    // });

    


  // ALL Tutor Page
    //  All tutor
      app.get('/tutors', async (req, res) => {
      const limit = parseInt(req.query.limit) || 6;

      const result = await usersCollection
        .find({ role: "Tutor", status: "Active" })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      res.send(result);
    });

    // Tutor details
app.get('/tutors/:id', async (req, res) => {
      const { id } = req.params;
      const result = await usersCollection.findOne({
        _id: new ObjectId(id)
      });
      res.send(result);
    });






    app.post('/users', async (req, res) => {
      console.log("REQ BODY:", req.body);

      const user = req.body;

      if (!user || Object.keys(user).length === 0) {
        return res.status(400).send({ message: "User data missing" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });





    app.post('/users/login', async (req, res) => {
      const { email, uid } = req.body;

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({ message: 'User not found' });
      }

      // আপাতত token fake রাখলাম
      const token = 'dummy-jwt-token';

      res.send({
        token,
        user
      });
    });





    // Express Server (index.js / app.js)
    app.patch('/users/:email', async (req, res) => {
      const email = req.params.email;
      const updatedData = req.body;
      const query = { email: email };

      const updateDoc = {
        $set: {
          name: updatedData.name,
          image: updatedData.image
        },
      };



      // usersCollection 
      const result = await usersCollection.updateOne(query, updateDoc);

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "User not found in DB" });
      }

      res.send(result);
    });







    app.post('/applications', async (req, res) => {
      const application = req.body;

      if (!application) {
        return res.status(400).send({ message: "Application data missing" });
      }

      application.createdAt = new Date();

      const result = await applicationsCollection.insertOne(application);
      res.send(result);
    });


    app.get('/applications', async (req, res) => {
      const result = await applicationsCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });


    app.get('/applications/tutor/:tutorId', async (req, res) => {
      const { tutorId } = req.params;

      const result = await applicationsCollection.find({
        tutorId
      }).toArray();

      res.send(result);
    });



    // POST: Create new tuition post
    app.post("/tuitions", async (req, res) => {
      try {
        const tuitionData = req.body;

        // Basic validation
        if (!tuitionData.subject || !tuitionData.class || !tuitionData.location || !tuitionData.budget) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        // Default values
        tuitionData.status = "pending"; // always pending until admin approves
        tuitionData.createdAt = new Date();

        const result = await tuitionCollection.insertOne(tuitionData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error posting tuition:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });



    ///////////////// Student ///////////////////////////////


    // PUT: Update tuition post
    app.put("/tuitions/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        const result = await tuitionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating tuition:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // DELETE: Remove tuition post
    app.delete("/tuitions/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await tuitionCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error("Error deleting tuition:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });


    // 1️⃣ Post new tuition
    app.post("/tuitions", async (req, res) => {
      const tuitionData = req.body;
      tuitionData.status = "pending"; // default status
      tuitionData.createdAt = new Date();
      const result = await tuitionCollection.insertOne(tuitionData);
      res.status(201).send(result);
    });

    // 2️⃣ Get all tuitions (optional filter by studentEmail)
    app.get("/tuitions", async (req, res) => {
      const { studentEmail } = req.query;
      const query = studentEmail ? { studentEmail } : {};
      const result = await tuitionCollection.find(query).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // 3️⃣ Get single tuition by ID
    app.get("/tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const result = await tuitionCollection.findOne({ _id: new ObjectId(id) });
      if (!result) return res.status(404).send({ message: "Tuition not found" });
      res.send(result);
    });

    // 4️⃣ Get all tuitions of a specific student (My Tuitions)
    app.get("/my-tuitions/:email", async (req, res) => {
      const email = req.params.email;
      const result = await tuitionCollection.find({ studentEmail: email }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // 5️⃣ Update tuition post
    app.put("/tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const result = await tuitionCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    // 6️⃣ Delete tuition post
    app.delete("/tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const result = await tuitionCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

  



    

    // ////////////////////////Tutor//////////////////////////////////////

    // ✅ Tutor: View Own Applications
    app.get('/applications/tutor/:email', async (req, res) => {
      const { email } = req.params;

      const result = await applicationsCollection.find({
        tutorEmail: email
      }).sort({ createdAt: -1 }).toArray();

      res.send(result);
    });

    // ✅ Tutor: Update Application
    app.put('/applications/:id', async (req, res) => {
      const { id } = req.params;
      const updateData = req.body;

      const result = await applicationsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      res.send(result);
    });





    // ✅ Tutor: Delete Application
    app.delete('/applications/:id', async (req, res) => {
      const { id } = req.params;

      const result = await applicationsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });


    // ✅ Tutor: Ongoing Tuitions
    app.get('/tutor/ongoing/:email', async (req, res) => {
      const { email } = req.params;

      const approvedApps = await applicationsCollection.find({
        tutorEmail: email,
        status: "Approved"
      }).toArray();

      const tuitionIds = approvedApps.map(app => new ObjectId(app.tuitionId));

      const tuitions = await tuitionCollection.find({
        _id: { $in: tuitionIds }
      }).toArray();

      res.send(tuitions);
    });


    // ✅ Tutor: Pagination-enabled Listing
    app.get('/tutors', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;

      const cursor = usersCollection
        .find({ role: "Tutor", status: "Active" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const tutors = await cursor.toArray();
      const totalTutors = await usersCollection.countDocuments({ role: "Tutor", status: "Active" });

      res.send({
        totalTutors,
        page,
        limit,
        totalPages: Math.ceil(totalTutors / limit),
        tutors
      });
    });







    // app.get('/students', async (req, res) => {
    //   const result = await usersCollection.find({ role: "Student" }).toArray();
    //   res.send(result);
    // });




//////////////////////////////// Admin   ////////////////////////////////////////

  //  Get all user
    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });


  // Dashboard role (Role base conditional rendering)
    app.get('/users/:email/role', async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role })
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);









app.get('/', (req, res) => {
  res.send('eTuitionBd is shifting shifting')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})


