import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum TipStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum TipWithdrawalStatus {
  NONE = 'none',
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum TipAsset {
  XLM = 'XLM',
  USDC = 'USDC',
}

@Entity('tips')
export class Tip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.receivedTips)
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @Column({ name: 'creator_id' })
  creatorId: string;

  @ManyToOne(() => User, (user) => user.sentTips, { nullable: true })
  @JoinColumn({ name: 'supporter_id' })
  supporter: User | null;

  @Column('uuid', { name: 'supporter_id', nullable: true })
  supporterId: string | null;

  @Column({ name: 'sender_wallet' })
  senderWallet: string;

  @Column({ name: 'receiver_wallet' })
  receiverWallet: string;

  @Column('decimal', { precision: 20, scale: 7 })
  amount: number;

  @Column({
    type: 'varchar',
    length: 10,
    default: TipAsset.XLM,
  })
  asset: TipAsset;

  @Column('varchar', { name: 'asset_issuer', nullable: true })
  assetIssuer: string | null;

  @Column({ nullable: true })
  message: string;

  @Column({ unique: true, nullable: true })
  transactionHash: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: TipStatus.PENDING,
  })
  status: TipStatus;

  @Column({
    name: 'withdrawal_status',
    type: 'varchar',
    length: 20,
    default: TipWithdrawalStatus.NONE,
  })
  withdrawalStatus: TipWithdrawalStatus;

  @Column({
    name: 'withdrawal_transaction_hash',
    unique: true,
    nullable: true,
  })
  withdrawalTransactionHash: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
