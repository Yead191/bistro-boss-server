require('dotenv').config()
const jwt = require('jsonwebtoken');
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY || 'key-yourkeyhere' });
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_TOKEN_SECRET);
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
        // await client.connect();

        const menuCollection = client.db('BistroBoss').collection('menu')
        const reviewCollection = client.db('BistroBoss').collection('reviews')
        const cartCollection = client.db('BistroBoss').collection('carts')
        const userCollection = client.db('BistroBoss').collection('users')
        const paymentCollection = client.db('BistroBoss').collection('payments')

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




        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const menu = req.body
            const result = await menuCollection.insertOne(menu)
            res.send(result)
        })

        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray()
            res.send(result)
        })
        //delete items
        app.delete('/menu/:id', async (req, res) => {
            const id = req.params.id
            // console.log(id);
            const query = { _id: new ObjectId(id) }
            // console.log(query);
            const result = await menuCollection.deleteOne(query)
            // console.log(result);
            res.send(result)
        })
        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await menuCollection.findOne(query)
            res.send(result)
        })

        app.patch('/menu/:id', async (req, res) => {
            const id = req.params.id
            const menu = req.body
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    name: menu.name,
                    category: menu.category,
                    price: menu.price,
                    recipe: menu.recipe,
                    image: menu.image
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc)
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
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
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



        //stripe
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            // console.log(price);
            const amount = parseInt(price * 100)
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card'],

            });


            res.send({
                clientSecret: paymentIntent.client_secret,
            });

        });
        app.post('/payments', async (req, res) => {
            const payment = req.body
            // console.log(payment);
            const result = await paymentCollection.insertOne(payment)

            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            }
            const deleteResult = await cartCollection.deleteMany(query)

            // mail gun

            mg.messages.create('sandbox8bc4fac6242e47e6bbd0831f085c404c.mailgun.org', {
                from: "Excited User <mailgun@sandbox8bc4fac6242e47e6bbd0831f085c404c.mailgun.org>",
                to: ["yead191@gmail.com"],
                subject: "Bistro Boss Order Confirmation",
                text: "Testing some Mailgun awesomeness!",
                html: `
                <div> 
                <h1>Thank You for your Order!</h1>
                <h4>Your Transaction Id: <strong> ${payment.transactionId} </strong> </h4>
                <p>We would like to get your feedback about the food! </p>
                </div>
                `
            })
                .then(msg => {
                    // console.log(msg)
                }) // logs response data
                .catch(err => {
                    // console.log(err)
                }); // logs any error




            res.send({ result, deleteResult })
        })

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            if (req.decoded.email !== email) {
                return res.status(403).send({ message: 'access-forbidden' })
            }
            const result = await paymentCollection.find(query).toArray()
            res.send(result)
        })
        app.get('/user-stats/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            if (req.decoded.email !== email) {
                return res.status(403).send({ message: 'access-forbidden' });
            }

            try {
                const payments = await paymentCollection.find(query).toArray();

                // Calculate totalPaid
                const totalPaid = payments.reduce((sum, payment) => sum + payment.price, 0);

                // Calculate totalOrders (sum of cartIds or menuIds)
                const totalOrders = payments.reduce((sum, payment) => {
                    return sum + (payment.cartIds?.length || 0);
                }, 0);
                const totalTransactions = payments.filter(payment => payment.transactionId).length;
                const menuItems = await menuCollection.estimatedDocumentCount()


                res.send({
                    totalPaid,
                    totalOrders,
                    totalTransactions,
                    menuItems
                });
            } catch (error) {
                console.error("Error fetching user stats:", error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });




        //stats or analytics 

        app.get('/admin-stats', verifyToken, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount()
            const menuItems = await menuCollection.estimatedDocumentCount()
            const orders = await paymentCollection.estimatedDocumentCount()
            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$price" }
                    }
                }
            ]).toArray()

            const revenue = result.length > 0 ? result[0].totalRevenue.toFixed(2) : 0


            res.send({ users, menuItems, orders, revenue })
        })
        app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: '$menuIds'
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: {
                            $sum: 1
                        },
                        revenue: { $sum: '$menuItems.price' }

                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue'
                    }
                }
            ]).toArray()
            res.send(result)
        })




        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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