const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');
const port = process.env.PORT || 3000

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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



    /////sudhu approve show hobe/////


    app.get("/tuitions", async (req, res) => {
      try {
        const tuitions = await tuitionCollection
          .find({ status: "Approved" })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(tuitions);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });



    ///////////////Add/////////////

    app.post("/tuitions", async (req, res) => {
      try {
        const tuitionData = req.body;

        tuitionData.status = "Pending";
        tuitionData.createdAt = new Date();

        const result = await tuitionCollection.insertOne(tuitionData);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to Post Tuition" });
      }
    });




    ///////Student nijer Tuition dekhbe////////

    app.get("/my-tuitions/:email", async (req, res) => {
      const email = req.params.email;
      const result = await tuitionCollection.find({ studentEmail: email }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });


    /////////////Admin Panel: Pending Tuitions/////////

    // GET: All tuition posts for admin
    app.get("/tuitionManagement", async (req, res) => {
      try {
        const result = await tuitionCollection.find().sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to load tuitions" });
      }
    });

    // PATCH: Update tuition status (approve/reject)
    app.patch("/tuitions/:id/status", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      if (!["Approved", "Rejected"].includes(status)) {
        return res.status(400).send({ error: "Invalid status" });
      }

      try {
        const result = await tuitionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update status" });
      }
    });







    //////////////////////////////////////////////////////////////////////
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
          paymentStatus: "Paid",
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

    // tuition details by id
    app.get('/tuitions/:id', async (req, res) => {
      const id = req.params.id;
      const tuition = await tuitionCollection.findOne({ _id: new ObjectId(id) });
      if (!tuition) {
        return res.status(404).send({ message: "Tuition not found" });
      }
      res.send(tuition);
    });

    // Apply tutor////////////////////////////////////////////////////


    app.post("/apply-tuition", async (req, res) => {
      const application = req.body;

      try {
        // ---------- 🎯 STEP-1: Tuition ObjectId Ensure ----------
        const tuitionObjId = new ObjectId(application.tuitionId);

        // ---------- 🎯 STEP-2: Tuition theke Student Email  ----------
        const tuition = await tuitionCollection.findOne({ _id: tuitionObjId });

        // student email save 
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






    ////////students tar tuition dekhte parbe/////////////

    app.get("/my-tuitions/:email", async (req, res) => {
      const email = req.params.email;
      const result = await tuitionCollection.find({ studentEmail: email }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });








    ///////////////////////////////////////////////////////////////////////////////////////////////


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
        const id = req.params.id;
        const { qualifications, experience, expectedSalary, contact, status } = req.body;

        const application = await applicationsCollection.findOne({ _id: new ObjectId(id) });
        if (!application) return res.status(404).send({ success: false, message: "Application not found" });

        if (application.status === "Approved") {
          return res.status(400).send({ success: false, message: "Cannot update approved application" });
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

        // যদি স্ট্যাটাস Approved হয়, tuition আপডেট
        if (status === "Approved") {
          await tuitionCollection.updateOne(
            { _id: application.tuitionId },
            { $set: { status: "Ongoing", tutorEmail: application.tutorEmail } }
          );
        }

        res.send({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: "Failed to update application" });
      }
    });



    ///////////////////////////////////// applied tutors //////////////////////////////////////////////




    // ✅ Get all tutor applications for a student's tuition posts(applied tutors)
    app.get("/applications/student/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const applications = await applicationsCollection
          .find({ tuitionStudentEmail: email })   // filter by student email
          .sort({ createdAt: -1 })
          .toArray();
        res.send(applications);
      } catch (err) {
        console.error("Error fetching applications:", err);
        res.status(500).send({ error: "Failed to fetch applications" });
      }
    });

    // ✅ Create Stripe checkout session
    app.post('/payment-checkout-session', async (req, res) => {
      try {
        console.log("Incoming payment request:", req.body); console.log("Stripe Secret:", process.env.STRIPE_SECRET_KEY); console.log("Site Domain:", process.env.SITE_DOMAIN);
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
          success_url: `${process.env.SITE_DOMAIN}/dashboard/student/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/student/payment-cancelled`

          // success_url: `${process.env.SITE_DOMAIN}/dashboard/student/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          // cancel_url: `${process.env.SITE_DOMAIN}/dashboard/student/payment-cancelled`

        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe session error:", error);
        res.status(500).send({ error: "Failed to create checkout session" });
      }
    });

    // ✅ Finalize payment and approve tutor
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







    //Update application status (Reject)

    app.put("/applications/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      try {
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to update status" });
      }
    });



    //////////////////////////////  My Applications page for tutor ///////////////////////////////////////////////apply 


    app.get('/my-applications/tutor/:email', async (req, res) => {
      try {
        const tutorEmail = req.params.email;

        const result = await applicationsCollection
          .find({ tutorEmail })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Tutor My Applications Error:", error);
        res.status(500).send({ error: "Failed to load tutor applications" });
      }
    });

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

    // daran

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







