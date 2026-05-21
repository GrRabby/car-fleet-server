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

  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
    console.log('Server is running')
})