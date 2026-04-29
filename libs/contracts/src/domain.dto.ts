export interface DomainDto {
  id: string;
  name: string;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING';
  createdAt?: string;
  updatedAt?: string;
}

