-- Decyzja 15.10 (#1): zamówienie domeny z niepewnym wynikiem u rejestratora (bez zwrotu do czasu sprawdzenia).
ALTER TYPE "DomainRegistrarOrderStatus" ADD VALUE IF NOT EXISTS 'UNCERTAIN';
