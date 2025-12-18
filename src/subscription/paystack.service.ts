import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

export interface InitializeTransactionDto {
  email: string;
  amount: number;
  reference: string;
  callback_url: string;
  channels?: string[]; // Optional: Specify payment channels (e.g., ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'])
}

export interface InitializeTransactionResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface VerifyTransactionResponse {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at: string;
  channel: string;
  customer: {
    email: string;
  };
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    if (!this.secretKey) {
      this.logger.warn(
        'PAYSTACK_SECRET_KEY is not set in environment variables'
      );
    }
  }

  /**
   * Initialize a Paystack transaction
   * @param data Transaction initialization data
   * @returns Authorization URL and access code
   */
  async initializeTransaction(
    data: InitializeTransactionDto
  ): Promise<InitializeTransactionResponse> {
    try {
      this.logger.log(
        `Initializing transaction for ${data.email} - Amount: ${data.amount} - Reference: ${data.reference}`
      );

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transaction/initialize`,
          {
            email: data.email,
            amount: data.amount,
            reference: data.reference,
            callback_url: data.callback_url,
            ...(data.channels && { channels: data.channels }),
          },
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      if (!response.data.status) {
        throw new HttpException(
          response.data.message || 'Failed to initialize transaction',
          HttpStatus.BAD_REQUEST
        );
      }

      this.logger.log(
        `Transaction initialized successfully: ${data.reference}`
      );

      return {
        authorization_url: response.data.data.authorization_url,
        access_code: response.data.data.access_code,
        reference: response.data.data.reference,
      };
    } catch (error) {
      this.handlePaystackError(error, 'initialize transaction');
    }
  }

  /**
   * Verify a Paystack transaction
   * @param reference Transaction reference
   * @returns Verification data
   */
  async verifyTransaction(
    reference: string
  ): Promise<VerifyTransactionResponse> {
    try {
      this.logger.log(`Verifying transaction: ${reference}`);

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
            },
          }
        )
      );

      if (!response.data.status) {
        throw new HttpException(
          response.data.message || 'Failed to verify transaction',
          HttpStatus.BAD_REQUEST
        );
      }

      this.logger.log(`Transaction verified successfully: ${reference}`);

      const data = response.data.data;
      return {
        status: data.status,
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        paid_at: data.paid_at,
        channel: data.channel,
        customer: {
          email: data.customer.email,
        },
      };
    } catch (error) {
      this.handlePaystackError(error, 'verify transaction');
    }
  }

  /**
   * Handle Paystack API errors
   * @param error Error object
   * @param operation Operation being performed
   */
  private handlePaystackError(error: any, operation: string): never {
    if (error instanceof HttpException) {
      throw error;
    }

    const axiosError = error as AxiosError;

    if (axiosError.response) {
      // Paystack API returned an error response
      const data = axiosError.response.data as any;
      const message = data?.message || 'Paystack API error';
      const statusCode = axiosError.response.status;

      this.logger.error(
        `Paystack error while trying to ${operation}: ${message}`,
        axiosError.stack
      );

      throw new HttpException(
        {
          statusCode,
          message: `Payment processing failed: ${message}`,
          error: 'Paystack Error',
        },
        statusCode
      );
    } else if (axiosError.request) {
      // Network error - no response received
      this.logger.error(
        `Network error while trying to ${operation}`,
        axiosError.stack
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message:
            'Unable to connect to payment service. Please try again later.',
          error: 'Network Error',
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    } else {
      // Other errors
      this.logger.error(
        `Unexpected error while trying to ${operation}: ${error.message}`,
        error.stack
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred. Please try again.',
          error: 'Internal Server Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
