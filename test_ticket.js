const { PrismaClient } = require('../../libs/database/node_modules/@prisma/client');
const jwt = require('jsonwebtoken');

async function test() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ where: { role: 'USER' } });
  if (!user) {
    console.log("No user found");
    return;
  }
  const token = jwt.sign({ sub: user.id }, "verris_jwt_secret", { expiresIn: '1h' });
  console.log("Token:", token);
  
  const res = await fetch("http://localhost:3000/tickets", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ subject: "Test issue from script", message: "This is a detailed message testing ticket creation." })
  });
  
  const body = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", body);
}
test();
