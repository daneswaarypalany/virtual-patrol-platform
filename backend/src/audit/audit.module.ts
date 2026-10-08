import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Global so any controller/service can inject AuditService without
// importing this module everywhere.
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}