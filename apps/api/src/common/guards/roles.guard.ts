import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@ekohost/database';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    // Jeśli brak narzuconych ról, zezwalamy
    if (!requiredRoles) {
      return true;
    }
    
    // Użytkownik znajduje się w żądaniu poprzez działający JWTAuthGuard
    const { user } = context.switchToHttp().getRequest();
    
    if (!user) {
      return false;
    }
    
    return requiredRoles.includes(user.role);
  }
}
