import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    // No error is thrown if no user is found
    // We return user if it exists, otherwise null
    if (err || !user) {
      return null;
    }
    return user;
  }
}
