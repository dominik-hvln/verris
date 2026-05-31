-- Per-node authoritative nameservers handed to provisioned DirectAdmin accounts
-- (ns1/ns2 on CMD_API_ACCOUNT_USER). NULL = inherit platform default.
ALTER TABLE "Server" ADD COLUMN "ns1" TEXT;
ALTER TABLE "Server" ADD COLUMN "ns2" TEXT;
ALTER TABLE "Server" ADD COLUMN "ns3" TEXT;
