const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');
const port = process.env.PORT || 3000

const stripe = require("stripe")(process.env.STRIPE_SECRET);

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
    const paymentsCollection = db.collection('payments');
    const applicationsCollection = db.collection("applications");





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



//////////////Get all tuition\\\\\\\\\\\\\\\\\


// GET all tuitions with optional filters
app.get("/tuitions", async (req, res) => {
  try {
    const { studentEmail, subject, location, className, sort, page = 1, limit = 6 } = req.query;

    let query = {};
    if (studentEmail) query.studentEmail = studentEmail;
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
  } catch (error) {
    console.error("Error fetching tuitions:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});







// Create Stripe checkout session
app.post('/payment-checkout-session', async (req, res) => {
  try {
    const {
      applicationId,
      expectedSalary,
      tutorEmail,
      tutorName,
      subject,
      tuitionClass,
      tuitionId,
      studentEmail
    } = req.body;

    if (!applicationId || !expectedSalary || !tutorEmail || !tutorName || !subject || !tuitionClass || !tuitionId || !studentEmail) {
      return res.status(400).send({ error: "Missing required fields" });
    }

    const amount = parseInt(expectedSalary);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).send({ error: "Invalid expectedSalary" });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount * 100,
            product_data: {
              name: `Tuition: ${subject} | Class: ${tuitionClass}`,
              description: `Tutor: ${tutorName} | Email: ${tutorEmail}`
            }
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      customer_email: studentEmail,
      metadata: { applicationId, tuitionId, tutorEmail },
      success_url: `${process.env.SITE_DOMAIN}/student/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/student/payment-cancelled`
    });

    res.send({ url: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    res.status(500).send({ error: "Failed to create checkout session" });
  }
});


// Finalize payment and approve tutor
app.patch('/payment-success', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).send({ error: "Missing sessionId" });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== 'paid') {
      return res.status(400).send({ error: "Payment not confirmed" });
    }

    const applicationId = session.metadata.applicationId;
    const tuitionId = session.metadata.tuitionId;
    const tutorEmail = session.metadata.tutorEmail;

    const appId = new ObjectId(applicationId);
    const tid = new ObjectId(tuitionId);

    // Save payment record
    const payment = {
      amount: session.amount_total / 100,
      currency: session.currency,
      studentEmail: session.customer_email,
      tutorEmail,
      transactionId: session.payment_intent,
      sessionId: session.id,
      applicationId,
      tuitionId,
      paymentStatus: session.payment_status,
      paidAt: new Date()
    };
    await paymentsCollection.insertOne(payment);

    // Approve selected tutor
    await applicationsCollection.updateOne(
      { _id: appId },
      { $set: { status: "Approved", transactionId: session.payment_intent } }
    );

    // Reject other applications
    await applicationsCollection.updateMany(
      { tuitionId: tid, _id: { $ne: appId } },
      { $set: { status: "Rejected" } }
    );

    // Update tuition status
    await tuitionCollection.updateOne(
      { _id: tid },
      { $set: { status: "Ongoing", tutorEmail } }
    );

    res.send({ success: true });
  } catch (error) {
    console.error("Payment success error:", error);
    res.status(500).send({ error: "Failed to finalize payment" });
  }
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
    // app.get("/tuitions", async (req, res) => {
    //   try {
    //     const { studentEmail } = req.query;
    //     let query = {};
    //     if (studentEmail) {
    //       query.studentEmail = studentEmail;
    //     }
    //     const result = await tuitionCollection.find(query).sort({ createdAt: -1 }).toArray();
    //     res.send(result);
    //   } catch (error) {
    //     console.error("Error fetching tuitions:", error);
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

    // Apply tutor      //////////////////////////////////////////////////////////////


app.post("/apply-tuition", async (req, res) => {
  const application = req.body;

  try {
    // ---------- 🎯 STEP-1: Tuition ObjectId Ensure ----------
    const tuitionObjId = new ObjectId(application.tuitionId);

    // ---------- 🎯 STEP-2: Tuition থেকে Student Email নিয়ে আসো ----------
    const tuition = await tuitionCollection.findOne({ _id: tuitionObjId });

    // 👉 এখানে student email save করলাম
    application.studentEmail =
      tuition?.student?.email || tuition?.studentEmail || null;

    // ---------- 🎯 STEP-3: Other fields ----------
    application.tuitionId = tuitionObjId;
    application.status = "Pending";
    application.createdAt = new Date();

    // ---------- 🎯 STEP-4: Duplicate Check ----------
    const exist = await applicationsCollection.findOne({
      tutorEmail: application.tutorEmail,
      tuitionId: tuitionObjId
    });

    if (exist) {
      return res
        .status(409)
        .send({ success: false, message: "Already applied" });
    }

    // ---------- 🎯 STEP-5: Insert ----------
    const result = await applicationsCollection.insertOne(application);

    res.send({ success: true, insertedId: result.insertedId });

  } catch (err) {
    console.error("Apply Tuition Error:", err);
    res.status(500).send({ success: false, message: "Apply failed" });
  }
});  
///////////////////// Student application api///////////////////

app.get("/applications/student/:email", async (req, res) => {
  const email = req.params.email;

  try {
    const result = await applicationsCollection
      .find({ studentEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.log("Student Applications Error:", error);
    res.status(500).send({ error: "Failed to load applications" });
  }
});


///////////////////////////////////////////////////////////////////////////////////////////////
    // Sorting (All tuition page)
    // app.get('/tuitions', async (req, res) => {
    //   const { subject, location, className, sort, page = 1, limit = 6 } = req.query;

    //   let query = { status: "Approved" };

    //   if (subject) query.subject = { $regex: subject, $options: "i" };
    //   if (location) query.location = { $regex: location, $options: "i" };
    //   if (className) query.class = className;

    //   let cursor = tuitionCollection.find(query);

    //   if (sort === "budget") cursor = cursor.sort({ budget: 1 });
    //   if (sort === "date") cursor = cursor.sort({ createdAt: -1 });

    //   const result = await cursor
    //     .skip((page - 1) * limit)
    //     .limit(parseInt(limit))
    //     .toArray();

    //   res.send(result);
    // });



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



//////////////// Student applied tutors dashboard  ////////////////////////////


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
    // app.get("/tuitions", async (req, res) => {
    //   const { studentEmail } = req.query;
    //   const query = studentEmail ? { studentEmail } : {};
    //   const result = await tuitionCollection.find(query).sort({ createdAt: -1 }).toArray();
    //   res.send(result);
    // });

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



// PATCH application status

app.patch("/applications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { qualifications, experience, expectedSalary, contact, status } = req.body;

    if (!qualifications && !experience && !expectedSalary && !contact && !status) {
      return res.status(400).send({ success: false, message: "Nothing to update" });
    }

    const updateFields = {};

    if (qualifications) updateFields.qualifications = qualifications;
    if (experience) updateFields.experience = experience;
    if (expectedSalary) updateFields.expectedSalary = expectedSalary;
    if (contact) updateFields.contact = contact;
    if (status) updateFields.status = status;

    const result = await applicationsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.modifiedCount > 0) {
      res.send({ success: true, message: "Application updated successfully" });
    } else {
      res.send({ success: false, message: "No changes made or application not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, message: "Failed to update application" });
  }
});




//////////////////////////////  MyApplication page for tutor ///////////////////////////////////////////////apply 


app.get('/my-applications/tutor/:email', async (req, res) => {
  try {
    const tutorEmail = req.params.email;

    const result = await applicationsCollection
      .find({ tutorEmail })
      .sort({ createdAt: -1 }) // <-- fix here
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Tutor My Applications Error:", error);
    res.status(500).send({ error: "Failed to load tutor applications" });
  }
});



app.get('/my-applications/student/:email', async (req, res) => {
  try {
    const studentEmail = req.params.email;

    const result = await applicationsCollection
      .find({ studentEmail })  
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Student My Applications Error:", error);
    res.status(500).send({ error: "Failed to load student applications" });
  }
});


            //  Update application (My Applications page-Update)
        app.patch('/applications/:id', async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const result = await applicationsCollection.updateOne(
                { _id: new ObjectId(id), status: { $ne: "Approved" } },
                { $set: updateData }
            );
            res.send(result);
        });

       // Delete application (My Applications page-Delete)
        app.delete('/applications/:id', async (req, res) => {
            const id = req.params.id;
            const result = await applicationsCollection.deleteOne({ _id: new ObjectId(id), status: { $ne: "Approved" } });
            res.send(result);
        });


///////////////////////////////////// Applied tutors //////////////////////////////////////////////
// app.get('/applications/student/:email', async (req, res) => {
//   const studentEmail = req.params.email;

//   try {

//     // 1️⃣ Student er tuition gula ber koro
//     const tuitions = await tuitionCollection.find({
//       "student.email": studentEmail
//     }).toArray();

//     const tuitionIds = tuitions.map(t => t._id);

//     if (!tuitionIds.length) {
//       return res.send([]);
//     }

//     // 2️⃣ oi tuitionId diye applications gula find koro
//     const applications = await applicationsCollection.find({
//       tuitionId: { $in: tuitionIds }
//     }).sort({ createdAt: -1 }).toArray();

//     // 3️⃣ tutor info attach koro
//     const tutorEmails = applications.map(a => a.tutorEmail);

//     const tutors = await usersCollection.find({
//       email: { $in: tutorEmails }
//     }, {
//       projection: {
//         _id: 1,
//         name: 1,
//         email: 1,
//         photoUrl: 1,
//         qualifications: 1,
//         experience: 1
//       }
//     }).toArray();

//     const tutorMap = tutors.reduce((obj, t) => {
//       obj[t.email] = t;
//       return obj;
//     }, {});

//     const finalResult = applications.map(app => ({
//       ...app,
//       tuitionInfo: tuitions.find(t => t._id.equals(app.tuitionId)),
//       tutorInfo: tutorMap[app.tutorEmail] || null
//     }));

//     res.send(finalResult);

//   } catch (error) {
//     console.error("Student Applications Error:", error);
//     res.status(500).send({ error: "Failed to load applications" });
//   }
// });

// Get all applications for a student (Applied Tutors)
// app.get("/applications/student/:email", async (req, res) => {
//   const studentEmail = req.params.email;

//   try {
//     const applications = await applicationsCollection.aggregate([
//       {
//         $lookup: {
//           from: "tuition",
//           localField: "tuitionId",
//           foreignField: "_id",
//           as: "tuitionInfo"
//         }
//       },
//       { $unwind: "$tuitionInfo" },
//       { $match: { "tuitionInfo.studentEmail": studentEmail } },
//       {
//         $lookup: {
//           from: "users",
//           let: { tutorEmail: "$tutorEmail" },
//           pipeline: [
//             { $match: { $expr: { $eq: ["$email", "$$tutorEmail"] } } },
//             { $project: { _id: 1, name: 1, email: 1, photoUrl: 1, qualifications: 1, experience: 1 } }
//           ],
//           as: "tutorInfo"
//         }
//       },
//       { $unwind: { path: "$tutorInfo", preserveNullAndEmptyArrays: true } },
//       { $sort: { createdAt: -1 } }
//     ]).toArray();

//     res.send(applications);
//   } catch (err) {
//     console.error("Failed to fetch applied tutors:", err);
//     res.status(500).send({ error: "Failed to fetch applied tutors" });
//   }
// });







// app.get("/applications/student/:email", async (req, res) => {
//   const studentEmail = req.params.email;

//   try {
//     const result = await applicationsCollection.aggregate([
//       // Join tuition info
//       {
//         $lookup: {
//           from: "tuitions",
//           localField: "tuitionId",
//           foreignField: "_id",
//           as: "tuitionInfo"
//         }
//       },
//       { $unwind: "$tuitionInfo" },

//       // Filter by student email
//       { $match: { "tuitionInfo.student.email": studentEmail } },

//       // Join tutor info (optional, but nice)
//       {
//         $lookup: {
//           from: "users",
//           let: { tutorEmail: "$tutorEmail" },
//           pipeline: [
//             { $match: { $expr: { $eq: ["$email", "$$tutorEmail"] } } },
//             { $project: { _id: 1, name: 1, email: 1, photoUrl: 1, qualifications: 1, experience: 1 } }
//           ],
//           as: "tutorInfo"
//         }
//       },
//       { $unwind: { path: "$tutorInfo", preserveNullAndEmptyArrays: true } },

//       { $sort: { createdAt: -1 } }
//     ]).toArray();

//     res.send(result);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ error: "Failed to fetch applications" });
//   }
// });
// app.get('/applications/student/:email', async (req, res) => {
//   const studentEmail = req.params.email;

//   try {
//     const result = await applicationsCollection.aggregate([
//       {
//         $lookup: {
//           from: "tuitions",
//           localField: "tuitionId",
//           foreignField: "_id",
//           as: "tuitionInfo"
//         }
//       },
//       { $unwind: "$tuitionInfo" },
//       { $match: { "tuitionInfo.studentEmail": studentEmail } },
//       { $sort: { createdAt: -1 } }
//     ]).toArray();

//     res.send(result);
//   } catch (error) {
//     console.error("Error fetching applications:", error);
//     res.status(500).send({ error: "Failed to fetch applications" });
//   }
// });

// app.get('/applications/student/:email', async (req, res) => {
//   const studentEmail = req.params.email;

//   try {
//     const result = await applicationsCollection.aggregate([
      
//       {
//         $lookup: {
//           from: "tuition",
//           localField: "tuitionId",
//           foreignField: "_id",
//           as: "tuitionInfo"
//         }
//       },
//       { $unwind: "$tuitionInfo" },

      
//       { $match: { "tuitionInfo.studentEmail": studentEmail } },

      
//       {
//         $lookup: {
//           from: "users",
//           let: { tutorEmail: "$tutorEmail" }, 
//           pipeline: [
//             { $match: { $expr: { $eq: ["$email", "$$tutorEmail"] } } },
//             { $project: { _id: 1, name: 1, email: 1, photoUrl: 1, qualifications: 1, experience: 1, expectedSalary: 1 } }
//           ],
//           as: "tutorInfo"
//         }
//       },
//       { $unwind: { path: "$tutorInfo", preserveNullAndEmptyArrays: true } },

//       // 4️⃣ sort appliedAt descending
//       { $sort: { createdAt: -1 } }

//     ]).toArray();

//     res.send(result);

//   } catch (error) {
//     console.error("Error fetching applications:", error);
//     res.status(500).send({ error: "Failed to fetch applications" });
//   }
// });

// app.get('/applications/student/:email', async (req, res) => {

//   try {
//     const email = req.params.email;

//     const result = await applicationsCollection.aggregate([
//       {
//         $lookup: {
//           from: "tuition",          // ✅ correct collection name
//           localField: "tuitionId",
//           foreignField: "_id",
//           as: "tuitionInfo"
//         }
//       },
//       { $unwind: "$tuitionInfo" },
//       {
//         $match: {
//           "tuitionInfo.studentEmail": email   // ✅ correct field
//         }
//       },
//       { $sort: { appliedAt: -1 } }
//     ]).toArray();

//     res.send(result);
//   } catch (error) {
//     console.error("Student Applications Error:", error);
//     res.status(500).send({ error: "Failed to load applications" });
//   }
// });





// Reject application
///////////////////////////////////uporer 3 ta same/////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.patch('/applications/:id', async (req, res) => {
  const id = req.params.id;
  const updateData = req.body;
  try {
    const result = await applicationsCollection.updateOne(
      { _id: new ObjectId(id), status: { $ne: "Approved" } },
      { $set: updateData }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to update application" });
  }
});

// Payment checkout session
app.post('/payment-checkout-session', async (req, res) => {
  const { applicationId, expectedSalary, tutorEmail, tutorName, subject, tuitionClass, tuitionId, studentEmail } = req.body;
  const amount = parseInt(expectedSalary) * 100;

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: `Tuition: ${subject} | Class : ${tuitionClass}`,
              description: `Tutor: ${tutorName} | Email: ${tutorEmail}`
            }
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      metadata: { applicationId, tuitionId, tutorEmail },
      customer_email: studentEmail,
      success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`
    });

    res.send({ url: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    res.status(500).send({ error: "Failed to create checkout session" });
  }
});

// Verify payment success
app.patch('/payment-success', async (req, res) => {
  const sessionId = req.query.session_id;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const transactionId = session.payment_intent;
      const uniqueSessionId = session.id;

      const paymentExist = await paymentsCollection.findOne({ sessionId: uniqueSessionId });
      if (paymentExist) return res.send(paymentExist);

      const applicationId = session.metadata.applicationId;
      const tuitionId = session.metadata.tuitionId;
      const tutorEmail = session.metadata.tutorEmail;

      const application = await applicationsCollection.findOne({ _id: new ObjectId(applicationId) });
      const tuition = await tuitionCollection.findOne({ _id: new ObjectId(tuitionId) });

      const payment = {
        amount: session.amount_total / 100,
        currency: session.currency,
        studentEmail: session.customer_email,
        tutorEmail,
        tutorName: application.tutorName,
        subject: tuition.subject,
        class: tuition.class,
        paidAt: new Date(),
        transactionId,
        sessionId: uniqueSessionId,
        applicationId,
        tuitionId,
        paymentStatus: session.payment_status
      };

      await paymentsCollection.insertOne(payment);
      await applicationsCollection.updateOne(
        { _id: new ObjectId(applicationId) },
        { $set: { status: "Approved", transactionId } }
      );

      return res.send(payment);
    }
    return res.send({ success: false });
  } catch (error) {
    console.error("Payment success error:", error);
    res.status(500).send({ error: "Failed to verify payment" });
  }
});


/////////////////////////////////////// Tutor   ///////////////////////////////////////


// Get all applications
app.get("/applications", async (req, res) => {
  try {
    const result = await applicationsCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

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

// Application delete api
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

  // Update application status
  const result = await applicationsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );

  
  if (status === "Approved") {
    const application = await applicationsCollection.findOne({ _id: new ObjectId(id) });
    await tuitionCollection.updateOne(
      { _id: application.tuitionId },
      { $set: { status: "Ongoing", tutorEmail: application.tutorEmail } }
    );
  }

  res.send(result);
});



// //////////////////////////////  Admin  /////////////////////////////////////////////


// Get All Tuitions
// app.get("/tuitions", async (req, res) => {
//   try {
//     const tuitions = await tuitionCollection.find().toArray();
//     res.send(tuitions);
//   } catch (error) {
//     res.status(500).send({ message: "Failed to load tuitions" });
//   }
// });



// Update Status (Approve / Reject)
app.patch("/tuitions/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).send({ message: "Invalid status" });
    }

    const result = await tuitionCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    res.send({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to update status" });
  }
});

app.get("/tuitions", async (req, res) => {
  try {
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
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

//Student-এর নিজের টিউশন দেখানোর API//

app.get("/tuitions/student", async (req, res) => {
  try {
    const { studentEmail } = req.query;
    if (!studentEmail) return res.status(400).send({ message: "Email required" });

    const result = await tuitionCollection
      .find({ studentEmail }) 
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

//Admin panel API (pending tuitions for approval)
app.get("/tuitions/admin", async (req, res) => {
  try {
    const tuitions = await tuitionCollection
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(tuitions);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal Server Error" });
  }
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


  // Dashboard role (Role base conditional rendering)////////////////////////////////////////////////
    app.get('/users/:email/role', async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const user = await usersCollection.findOne(query);
      // res.send({ role: user?.role })
      res.send({ role: user?.role || "User" });
    })

    console.log("Pinged your deployment. You successfully connected to MongoDB!");


  } finally {
    
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







