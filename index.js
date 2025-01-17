require('dotenv').config()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 5000


//middleware
app.use(express.json())
app.use(cors())




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pjwkg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        await client.connect();

        const menuCollection = client.db('BistroBoss').collection('menu')
        const reviewCollection = client.db('BistroBoss').collection('reviews')
        const cartCollection = client.db('BistroBoss').collection('carts')
        const userCollection = client.db('BistroBoss').collection('users')

        //jwt related apis
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
            res.send({ token })
        })

        //jwt middleware
        const verifyToken = (req, res, next) => {

            // console.log('inside Verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'access-unauthorized' })

            }
            const token = req.headers.authorization.split(' ')[1]
            // verify a token symmetric
            jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
                if (err) {
                    return res.status(401).send({ message: 'access-unauthorized' })
                }
                req.decoded = decoded
                next()

            });


        }


        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden-access' })

            }
            next()
        }





        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray()
            res.send(result)
        })

        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray()
            res.send(result)
        })

        //cart 
        app.post('/carts', async (req, res) => {
            const cart = req.body
            const result = await cartCollection.insertOne(cart)
            res.send(result)
        })
        app.get('/carts', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await cartCollection.find(query).toArray()
            res.send(result)
        })
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query)
            res.send(result)
        })


        //user
        app.post('/users', async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const isExist = await userCollection.findOne(query)
            if (isExist) {
                return res.send({ message: 'User already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user)
            res.send(result)
        })
        app.get('/users', verifyToken, verifyAdmin,  async (req, res) => {
            const result = await userCollection.find().toArray()
            res.send(result)
        })
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query)
            res.send(result)
        })


        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'access-forbidden' })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let admin = false
            if (user) {
                admin = user?.role === 'admin'
            }
            res.send({ admin })
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
    res.send('bistro server running')
})
app.listen(port, () => {
    console.log('server running on:', port);
})