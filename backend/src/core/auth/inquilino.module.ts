import { Global, Module } from '@nestjs/common';
import { InquilinoService } from './inquilino.service';

@Global()
@Module({
  providers: [InquilinoService],
  exports: [InquilinoService],
})
export class InquilinoModule {}
