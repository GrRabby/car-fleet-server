const express =require('express')
const dotenv = require('dotenv')
dotenv.config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = process.env.MONNGODB_URL
const cors = require('cors');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const app = express()
app.use(cors())
app.use(express.json())
const PORT = process.env.PORT

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/auth/jwks`)
)
const verifyToken = async (req,res,next) => {
  const authToken = req?.headers.authorization
  if(!authToken){
    return res.status(401).json({message : "Unauthorized"})
  }
  const token = authToken.split(" ")[1]
  if(!token){
    return res.status(401).json({message : "Unauthorized"})
  }
  try{
    const {payload} = await jwtVerify(token,JWKS)
    req.user = {
        id: payload.sub,    
        email: payload.email,
        name: payload.name,
        ...payload,  
    };
    next()
  }catch(error){
    return res.status(403).json({message : "Forbiden"})
  }
  
  
  
}
async function run() {
  try {
    await client.connect();
    const db = client.db('drive_fleet')
    const carCollections = db.collection('CarList')
    const bookingCollections = db.collection('Bookings')

    app.get('/', async (req,res) => {
        const result = await carCollections.find().limit(6).toArray()
        res.json(result)
    })
    app.get('/explore-cars', async (req, res) => {
      const { search, type, availability, sort } = req.query;
      const query = {};
      if (search) {
          query['name'] = {
              $regex: search,
              $options: 'i',
          };
      }
      if (type && type !== 'All') {
          query['type'] = { $in: [type] };
      }
      if (availability) {
          query['availability'] = availability;
      }
      let sortOption = { createdAt: -1 };
      switch (sort) {
          case 'oldest':
              sortOption = { createdAt: 1 };
              break;
          case 'priceHigh':
              sortOption = { pricePerDay: -1 };
              break;
          case 'priceLow':
              sortOption = { pricePerDay: 1 };
              break;
      }
      const result = await carCollections
          .find(query)
          .sort(sortOption)
          .toArray();

      res.json(result);
    });
    app.post('/add-car', verifyToken ,async (req,res) => {
      const carDetails = req.body
      const result = await carCollections.insertOne(carDetails)
      res.json(result)
    })
    app.get('/cars/:id', async (req, res) => {
        const { id } = req.params;
        const car = await carCollections.findOne({ _id: new ObjectId(id) });
        if (!car) {
            return res.status(404).json({ error: 'Car not found' });
        }

        res.json(car);
    });
    app.get('/bookings/check/:carId', verifyToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const { carId } = req.params;
            const booking = await bookingCollections.findOne({
                userID: userId,
                carId: carId,
            });
            res.json({
                booked: !!booking,
            });
        } catch (err) {
            console.error('Error checking booking:', err);
            res.status(500).json({ error: 'Failed to check booking status' });
        }
    });
    app.post('/bookings', verifyToken, async (req, res) => {
        const bookingData = req.body;

        const booking = {
            ...bookingData,
            createdAt: new Date().toISOString(),
        };
        const result = await bookingCollections.insertOne(booking);
        await carCollections.updateOne(
            { _id: new ObjectId(bookingData.carId) },
            { $inc: { booking_count: 1 } }
        );
        res.json(result);
    });
    app.patch('/added-cars/:id',verifyToken, async (req, res) => {
        const {id} = req.params;
        const updatedData = req.body;

        const result = await carCollections.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: updatedData
            }
        );

        res.send(result);
    });
    app.delete('/added-cars/:id',verifyToken, async (req, res) => {
        const {id} = req.params;
        const result = await carCollections.deleteOne(
            { _id: new ObjectId(id) },
        );

        res.send(result);
    });
    app.get('/added-cars/:id',verifyToken, async (req,res) => {
      const {id} = req.params;
      const result = await carCollections.find({userID: id }).toArray()
      res.json(result)
    });
    app.get('/my-bookings', verifyToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const bookings = await bookingCollections
                .find({ userID: userId })
                .sort({ createdAt: -1 })
                .toArray();
            res.json(bookings);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch bookings' });
        }
    });
    app.delete('/bookings/:id', verifyToken, async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            const booking = await bookingCollections.findOne({ _id: new ObjectId(id) });
            if (!booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }
            if (booking.userID !== userId) {
                return res.status(403).json({ error: 'Not authorized' });
            }
            await bookingCollections.deleteOne({ _id: new ObjectId(id) });
            await carCollections.updateOne(
                { _id: new ObjectId(booking.carId) },
                { $inc: { booking_count: -1 } }
            );

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to cancel booking' });
        }
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
    console.log('Server is running')
})