import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MasterAuthService } from './master-auth.service';

@Injectable()
export class MasterGuard implements CanActivate {
  constructor(private readonly masterAuth: MasterAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth: string | undefined = req.headers['authorization'];
    if (!auth) throw new UnauthorizedException();

    const token = auth.split(' ')[1];
    const session = await this.masterAuth.getByToken(token);
    if (!session) throw new UnauthorizedException();

    req.masterUser = session;
    return true;
  }
}
