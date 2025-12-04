import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TaskStatus, TaskType } from "@prisma/client";

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  async createTask(userId: string, type: TaskType) {
    return this.prisma.task.create({
      data: {
        userId,
        type,
        status: TaskStatus.PENDING,
      },
    });
  }

  async getTask(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task || task.userId !== userId) {
      throw new NotFoundException("Task not found");
    }

    return task;
  }

  async updateTask(
    taskId: string,
    status: TaskStatus,
    result?: any,
    error?: string,
  ) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        result,
        error,
      },
    });
  }
}
