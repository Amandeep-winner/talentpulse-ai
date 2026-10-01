import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service';

export class UsersController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await usersService.listUsers(req.user!.organizationId);
      res.status(200).json({ data: users });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.createUser(req.user!.organizationId, req.body);
      res.status(201).json({ data: user });
    } catch (error) {
      next(error);
    }
  }

  async updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.updateUserRole(
        req.user!.organizationId,
        req.params.id as string,
        req.body.role,
        req.user!.id,
      );
      res.status(200).json({ data: user });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await usersService.deleteUser(
        req.user!.organizationId,
        req.params.id as string,
        req.user!.id,
      );
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const usersController = new UsersController();
