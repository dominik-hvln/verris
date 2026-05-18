import { categorizeProvisioningError } from './provisioning-queue.service';

describe('categorizeProvisioningError', () => {
  it.each([
    'DirectAdmin timeout after 30000ms',
    'ECONNRESET while calling DA',
    '502 Bad Gateway from node',
    'All compute nodes are at capacity',
  ])('marks retry-safe infrastructure failures as transient: %s', (message) => {
    expect(categorizeProvisioningError(message)).toBe('transient');
  });

  it.each([
    'DirectAdmin credentials rejected',
    'domain already exists',
    'validation failed: invalid domain',
  ])('marks operator/data errors as permanent: %s', (message) => {
    expect(categorizeProvisioningError(message)).toBe('permanent');
  });
});
