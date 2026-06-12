import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTipDto {
  @ApiProperty({ description: 'Stellar wallet address of the tip recipient' })
  @IsString()
  @IsNotEmpty()
  receiverWallet: string;

  @ApiPropertyOptional({
    description: 'Stellar wallet address of the tip sender',
  })
  @IsString()
  @IsOptional()
  senderWallet?: string;

  @ApiProperty({ description: 'Tip amount', minimum: 0.0000001 })
  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @ApiPropertyOptional({ description: 'Optional message with the tip' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({
    description: 'Asset type: XLM or USDC',
    default: 'XLM',
  })
  @IsString()
  @IsOptional()
  asset?: string;

  @ApiPropertyOptional({
    description: 'Asset issuer address (required for USDC)',
  })
  @IsString()
  @IsOptional()
  assetIssuer?: string;

  @ApiPropertyOptional({
    description: 'Stellar transaction hash for on-chain verification',
  })
  @IsString()
  @IsOptional()
  transactionHash?: string;
}
