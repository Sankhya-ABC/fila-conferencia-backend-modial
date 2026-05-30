import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { NumeroConferenciaFilter } from '../dto/model';
import { VolumeService } from './volume.service';
import {
  DeletarVolumesLoteParams,
  PostAtualizarDimensoesVolumeDetalhadoParams,
  PostAtualizarDimensoesVolumeParams,
} from './dto/volume.dto';

@NoAuthApp()
@UseGuards(AuthUserGuard)
@ApiTags('Volumes')
@Controller('volumes')
export class VolumeController {
  constructor(private readonly service: VolumeService) {}

  @Get('')
  @ApiOperation({ summary: 'Listar Volumes' })
  getVolumes(@Query() queryParam: NumeroConferenciaFilter) {
    return this.service.getVolumes(queryParam);
  }

  @Post('gerar-volumes-lote')
  @ApiOperation({ summary: 'Gerar volumes em lote' })
  postGerarVolumesLote(@Body() body: any) {
    return this.service.gerarVolumesLote(body);
  }

  @Post('deletar-volumes-lote')
  @ApiOperation({ summary: 'Deletar volume lote' })
  postDeletarVolumesLote(@Body() body: DeletarVolumesLoteParams) {
    return this.service.deletarVolumesLote(body);
  }

  @Post('dimensoes-volume')
  postAtualizarDimensoesVolume(
    @Body() body: PostAtualizarDimensoesVolumeParams,
  ) {
    return this.service.postAtualizarDimensoesVolume(body);
  }
}
