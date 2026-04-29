import { NestFactory } from '@nestjs/core';
import { AppModule } from './apps/api/src/app.module';
import { TicketsService } from './apps/api/src/tickets/tickets.service';
import { PrismaService } from './libs/database/src/index';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const ticketsService = app.get(TicketsService);

  try {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      console.log('No user found');
      return;
    }
    
    console.log('Creating ticket for user:', admin.id);
    const result = await ticketsService.create(admin.id, {
      subject: 'Test Subject',
      message: 'Test Message 1234567890',
    });
    console.log('Success:', result);
  } catch (e) {
    console.error('Failure:', e);
  }
  await app.close();
}
bootstrap();
