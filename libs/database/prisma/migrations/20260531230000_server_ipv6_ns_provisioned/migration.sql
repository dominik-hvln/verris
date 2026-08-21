-- Public IPv6 of the node (AAAA glue + zone records) and a marker for when the
-- branded nameservers (OVH glue + zone) were provisioned for this node.
ALTER TABLE "Server" ADD COLUMN "ipv6Address" TEXT;
ALTER TABLE "Server" ADD COLUMN "nsProvisionedAt" TIMESTAMP(3);
