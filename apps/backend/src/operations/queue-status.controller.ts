import { Controller, Get, Inject } from "@nestjs/common";
import { QueueStatusService } from "./queue-status.service.js";

@Controller("queues")
export class QueueStatusController {
  constructor(
    @Inject(QueueStatusService)
    private readonly queueStatusService: QueueStatusService
  ) {}

  @Get()
  listQueues() {
    return this.queueStatusService.listQueues();
  }
}
