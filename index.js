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
    // const applicationsCollection = db.collection('applications');
    const applicationsCollection = db.collection("applications");
    const paymentsCollection = db.collection('payments');

    // JWT Related APIs

    // User create (Register & Login user info)
app.post('/users', async (req, res) => {
  const user = req.body;
  user.createdAt = new Date();          
  const email = user.email;
  user.photoUrl = req.body.photoUrl;

  // Check if user already exists
  const userExists = await usersCollection.findOne({ email });
  if (userExists) {
    return res.status(409).send({ message: 'User already exists' })
  }

  // Default role if not provided
  if (!user.role) {
    user.role = "Student";             
  }


  // Insert new user
  const result = await usersCollection.insertOne(user);
  res.send(result);
});


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



  // All Tutors - show all without limit
app.get('/tutors', async (req, res) => {
  try {
    const result = await usersCollection
      .find({ role: "Tutor", status: "Active" })
      .sort({ createdAt: -1 })
      .toArray();  

    res.send(result);
  } catch (error) {
    console.error("Error fetching tutors:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// Tutor details
app.get('/tutors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await usersCollection.findOne({ _id: new ObjectId(id) });
    if (!result) {
      return res.status(404).send({ message: "Tutor not found" });
    }
    res.send(result);
  } catch (error) {
    console.error("Error fetching tutor details:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});



//////////////////Tutor dashboard API///////////////////////

app.post("/applications", async (req, res) => {
  const data = req.body;

  // 🔒 Prevent Duplicate Apply (same tutor → same tuition)
  const exists = await applicationsCollection.findOne({
    tutorEmail: data.tutorEmail,
    tuitionId: data.tuitionId
  });

  if (exists) {
    return res.status(409).send({ message: "Already applied" });
  }

  const result = await applicationsCollection.insertOne(data);
  res.send(result);
});


  


app.get("/applications/tutor/:email", async (req, res) => {
  const email = req.params.email;
  const result = await applicationsCollection
    .find({ tutorEmail: email })
    .toArray();
  res.send(result);
});



app.get("/applications/tuition/:id", async (req, res) => {
  const id = req.params.id;
  const result = await applicationsCollection
    .find({ tuitionId: id })
    .toArray();
  res.send(result);
});



app.delete("/applications/:id", async (req, res) => {
  const id = req.params.id;
  const result = await applicationsCollection.deleteOne({
    _id: new ObjectId(id)
  });
  res.send(result);
});



app.patch("/applications/:id", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  const result = await applicationsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );

  res.send(result);
});



    ///////////////// Student ///////////////////////////////

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



// GET all users
app.get("/users", async (req, res) => {
  try {
    const result = await usersCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to load users" });
  }
});

// DELETE user
app.delete("/users/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Delete failed" });
  }
});

// UPDATE user role / status
app.put("/users/:id", async (req, res) => {
  const id = req.params.id;
  const update = req.body;

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Update failed" });
  }
});








  // Dashboard role (Role base conditional rendering)
    app.get('/users/:email/role', async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const user = await usersCollection.findOne(query);
      // res.send({ role: user?.role })
      res.send({ role: user?.role || "User" });



      
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




  // Express Server (index.js / app.js) ,,,,
    // app.patch('/users/:email', async (req, res) => {
    //   const email = req.params.email;
    //   const updatedData = req.body;
    //   const query = { email: email };

    //   const updateDoc = {
    //     $set: {
    //       name: updatedData.name,
    //       image: updatedData.image
    //     },
    //   };

    //   // usersCollection 
    //   const result = await usersCollection.updateOne(query, updateDoc);

    //   if (result.matchedCount === 0) {
    //     return res.status(404).send({ message: "User not found in DB" });
    //   }

    //   res.send(result);
    // });



     // 1️⃣ Post new tuition
    // app.post("/tuitions", async (req, res) => {
    //   const tuitionData = req.body;
    //   tuitionData.status = "pending"; // default status
    //   tuitionData.createdAt = new Date();
    //   const result = await tuitionCollection.insertOne(tuitionData);
    //   res.status(201).send(result);
    // });



    // ✅ Tutor: Pagination-enabled Listing
    // app.get('/tutors', async (req, res) => {
    //   const page = parseInt(req.query.page) || 1;
    //   const limit = parseInt(req.query.limit) || 6;
    //   const skip = (page - 1) * limit;

    //   const cursor = usersCollection
    //     .find({ role: "Tutor", status: "Active" })
    //     .sort({ createdAt: -1 })
    //     .skip(skip)
    //     .limit(limit);

    //   const tutors = await cursor.toArray();
    //   const totalTutors = await usersCollection.countDocuments({ role: "Tutor", status: "Active" });

    //   res.send({
    //     totalTutors,
    //     page,
    //     limit,
    //     totalPages: Math.ceil(totalTutors / limit),
    //     tutors
    //   });
    // });



    // ✅ Tutor: Pagination-enabled Listing with Search
// app.get('/tutors', async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 6;
//     const skip = (page - 1) * limit;
//     const search = req.query.search || "";

//     // Base query
//     let query = { role: "Tutor", status: "Active" };

//     // Optional search by name or subject
//     if (search) {
//       query = {
//         ...query,
//         $or: [
//           { name: { $regex: search, $options: "i" } },
//           { subject: { $regex: search, $options: "i" } }
//         ]
//       };
//     }

//     // Fetch tutors with pagination
//     const cursor = usersCollection
//       .find(query)
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit);

//     const tutors = await cursor.toArray();
//     const totalTutors = await usersCollection.countDocuments(query);

//     res.send({
//       totalTutors,
//       page,
//       limit,
//       totalPages: Math.ceil(totalTutors / limit),
//       tutors
//     });
//   } catch (error) {
//     console.error("Error fetching tutors:", error);
//     res.status(500).send({ message: "Internal Server Error" });
//   }
// });





// // All Tutors - show all without limit
// app.get('/tutors', async (req, res) => {
//   try {
//     const search = req.query.search || "";

//     let query = { role: "Tutor", status: "Active" };

//     // Optional search by name or subject
//     if (search) {
//       query = {
//         ...query,
//         $or: [
//           { name: { $regex: search, $options: "i" } },
//           { subject: { $regex: search, $options: "i" } }
//         ]
//       };
//     }

//     const tutors = await usersCollection
//       .find(query)
//       .sort({ createdAt: -1 })
//       .toArray();

//     res.send(tutors);
//   } catch (error) {
//     console.error("Error fetching tutors:", error);
//     res.status(500).send({ message: "Internal Server Error" });
//   }
// });







