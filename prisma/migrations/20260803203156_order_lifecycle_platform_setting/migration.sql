-- CreateTable
CREATE TABLE "food_platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ordering_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_platform_settings_pkey" PRIMARY KEY ("id")
);
