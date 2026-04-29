const jwt = require('jsonwebtoken');
// Any valid uuid will do since the JwtStrategy fetches from DB. I will read a valid uuid from DB.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const u = await prisma.user.findFirst({where: {role: 'USER'}});
  if (u) {
    const t = jwt.sign({sub: u.id, email: u.email, role: u.role}, process.env.JWT_SECRET || 'SuperSecretKey_ProductionChangeMe!');
    console.log(t);
  } else {
    console.log("NO_USER");
  }
}
run();
