-- CreateEnum
CREATE TYPE "report_reason" AS ENUM ('INAPPROPRIATE', 'SUSPECTED_SCAM', 'FOOD_SAFETY_CONCERN', 'OTHER');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "food_listings" ADD COLUMN     "taken_down_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "food_reports" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT,
    "seller_id" TEXT NOT NULL,
    "reporter_user_id" TEXT,
    "reason" "report_reason" NOT NULL,
    "message" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "food_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_reports_status_created_at_idx" ON "food_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "food_reports_listing_id_idx" ON "food_reports"("listing_id");

-- CreateIndex
CREATE INDEX "food_reports_seller_id_idx" ON "food_reports"("seller_id");

-- AddForeignKey
ALTER TABLE "food_reports" ADD CONSTRAINT "food_reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "food_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reports" ADD CONSTRAINT "food_reports_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "food_sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
