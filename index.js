const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken')
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()

// Middle Were
app.use(cors())
app.use(express.json())

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization

    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    const token = authHeader.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
        if (error) {
            return res.status(403).send({ message: 'forbidden access' })
        }

        req.decoded = decoded
        next()

    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.vlhy1ml.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        const appointmentOptionsCollection = client.db('doctorsPortal').collection('appointmentOptions')
        const bookingsCollection = client.db('doctorsPortal').collection('bookings')
        const usersCollection = client.db('doctorsPortal').collection('users')
        const doctorsCollection = client.db('doctorsPortal').collection('doctors')

        const verifyAdmin = async (req, res, next) => {
            console.log(req.decoded.email);
            const decodedEmail = req.decoded.email

            const query = { email: decodedEmail }
            const user = await usersCollection.findOne(query)

            if (user.role !== "admin") {
                return res.status(403).send({ message: 'forbidden access' })
            }


            next()
        }

        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date
            const query = {}
            const options = await appointmentOptionsCollection.find(query).toArray()
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray()

            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
                const bookedSlot = optionBooked.map(book => book.slot)
                const remainingSlot = option.slots.filter(slot => !bookedSlot.includes(slot))
                option.slots = remainingSlot
            })

            res.send(options)
        })

        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {}
            const result = await appointmentOptionsCollection.find(query).project({ name: 1 }).toArray()
            res.send(result)
        })

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email

            const decodedEmail = req.decoded.email

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email }
            const bookings = await bookingsCollection.find(query).toArray()
            res.send(bookings)
        })

        app.post('/bookings', async (req, res) => {
            const booking = req.body
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }
            const alreadyBooked = await bookingsCollection.find(query).toArray()
            if (alreadyBooked.length) {
                const message = `You Have An Already Booking ${booking.appointmentDate}`
                return res.send({ acknowledged: false, message })
            }
            const result = await bookingsCollection.insertOne(booking)
            res.send(result)
        })

        app.get('/users', async (req, res) => {
            const query = {}
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            res.send({ isAdmin: user?.role === "admin" })
        })

        app.post('/users', async (req, res) => {
            const user = req.body
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {

            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    role: "admin"
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })

        app.get('/jwt', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token })
            }
            res.status(403).send({ accessToken: "" })
        })

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {}
            const result = await doctorsCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body
            const result = await doctorsCollection.insertOne(doctor)
            res.send(result)
        })

        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const result = await doctorsCollection.deleteOne(filter)
            res.send(result)
        })

    }
    catch (e) {
        console.log(e);
    }
}
run()


app.get('/', (req, res) => {
    res.send('Server Is Running')
})

app.listen(port, () => {
    console.log(`SERVER RUNNING IN PORT ${port}`);
})