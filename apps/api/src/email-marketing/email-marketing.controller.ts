import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EmailMarketingService } from './email-marketing.service';
import {
  AddEmmContactDto,
  CreateEmmCampaignDto,
  CreateEmmListDto,
  ImportEmmContactsDto,
  UpdateEmmCampaignDto,
  UpdateEmmListDto,
} from './dto/email-marketing.dto';

/**
 * EMM — panel klienta produktu email-marketingu. Każdy endpoint jest
 * account-scoped: serwis weryfikuje, że `:subscriptionId` należy do
 * zalogowanego użytkownika, jest aktywny i jest produktem EMAIL_MARKETING.
 */
@Controller('email-marketing/:subscriptionId')
@UseGuards(JwtAuthGuard)
export class EmailMarketingController {
  constructor(private readonly emm: EmailMarketingService) {}

  @Get('overview')
  overview(@CurrentUser() user: { userId: string }, @Param('subscriptionId') subscriptionId: string) {
    return this.emm.overview(user.userId, subscriptionId);
  }

  // ---- Lists --------------------------------------------------------------

  @Get('lists')
  listLists(@CurrentUser() user: { userId: string }, @Param('subscriptionId') subscriptionId: string) {
    return this.emm.listLists(user.userId, subscriptionId);
  }

  @Post('lists')
  @HttpCode(201)
  createList(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: CreateEmmListDto,
  ) {
    return this.emm.createList(user.userId, subscriptionId, dto);
  }

  @Patch('lists/:listId')
  updateList(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Param('listId') listId: string,
    @Body() dto: UpdateEmmListDto,
  ) {
    return this.emm.updateList(user.userId, subscriptionId, listId, dto);
  }

  @Delete('lists/:listId')
  deleteList(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Param('listId') listId: string,
  ) {
    return this.emm.deleteList(user.userId, subscriptionId, listId);
  }

  // ---- Contacts -----------------------------------------------------------

  @Get('lists/:listId/contacts')
  listContacts(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Param('listId') listId: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.emm.listContacts(user.userId, subscriptionId, listId, {
      take: take ? Number.parseInt(take, 10) : undefined,
      skip: skip ? Number.parseInt(skip, 10) : undefined,
    });
  }

  @Post('lists/:listId/contacts')
  @HttpCode(201)
  addContact(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Param('listId') listId: string,
    @Body() dto: AddEmmContactDto,
  ) {
    return this.emm.addContact(user.userId, subscriptionId, listId, dto);
  }

  @Post('lists/:listId/contacts/import')
  importContacts(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Param('listId') listId: string,
    @Body() dto: ImportEmmContactsDto,
  ) {
    return this.emm.importContacts(user.userId, subscriptionId, listId, dto);
  }

  @Delete('lists/:listId/contacts/:contactId')
  deleteContact(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Param('listId') listId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.emm.deleteContact(user.userId, subscriptionId, listId, contactId);
  }

  // ---- Campaigns ----------------------------------------------------------

  @Get('campaigns')
  listCampaigns(@CurrentUser() user: { userId: string }, @Param('subscriptionId') subscriptionId: string) {
    return this.emm.listCampaigns(user.userId, subscriptionId);
  }

  @Post('campaigns')
  @HttpCode(201)
  createCampaign(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: CreateEmmCampaignDto,
  ) {
    return this.emm.createCampaign(user.userId, subscriptionId, dto);
  }

  @Patch('campaigns/:campaignId')
  updateCampaign(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: UpdateEmmCampaignDto,
  ) {
    return this.emm.updateCampaign(user.userId, subscriptionId, campaignId, dto);
  }

  @Post('campaigns/:campaignId/send')
  sendCampaign(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.emm.sendCampaign(user.userId, subscriptionId, campaignId);
  }

  @Delete('campaigns/:campaignId')
  deleteCampaign(
    @CurrentUser() user: { userId: string },
    @Param('subscriptionId') subscriptionId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.emm.deleteCampaign(user.userId, subscriptionId, campaignId);
  }
}
