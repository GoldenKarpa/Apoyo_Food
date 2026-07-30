# Apoyo Cocina – Product Vision & Architecture Brief

## Background

Apoyo is an ecosystem of platforms whose mission is to help Spanish-speaking immigrants in Trinidad establish reliable income through digital tools.

The beauty platform focuses on independent beauticians.

This platform focuses on independent food creators.

Unlike Uber Eats or food delivery marketplaces, the objective is **not** to become a logistics platform.

Instead, the goal is to become the preferred marketplace where independent cooks, bakers, dessert makers, caterers, and similar food entrepreneurs can showcase their work, build a following, receive orders, and grow sustainable income.

The platform should feel welcoming, community-driven, modern, and premium.

---

# Core Philosophy

The platform should answer two questions.

## Customer

> "Where can I discover amazing food made by local independent creators?"

## Seller

> "How can I consistently find more customers without relying entirely on Instagram or WhatsApp?"

Every feature should support one or both of these goals.

---

# What This Platform Is NOT

It is NOT:

- Uber Eats
- DoorDash
- FoodPanda
- a restaurant directory
- a delivery company

There will be no platform-managed delivery.

Delivery logistics are entirely between seller and customer.

Initially support:

- Pickup
- Seller delivery
- Meet-up location

---

# Target Audience

Customers:

Anyone living in Trinidad.

Sellers:

Independent individuals including:

- Home cooks
- Bakers
- Dessert creators
- Caterers
- Juice/smoothie makers
- BBQ vendors
- Holiday food specialists
- Weekend-only sellers

---

# Product Goals

Create reliable income.

Increase discoverability.

Help sellers build repeat customers.

Reduce dependence on social media.

Provide meaningful insights to sellers.

Create a premium customer browsing experience.

---

# Design Direction

The experience should feel closer to:

- Airbnb
- Pinterest
- Apple
- Instagram

rather than Uber Eats.

Focus on:

- beautiful photography
- generous whitespace
- premium typography
- large cards
- modern animations
- mobile-first
- PWA

Avoid:

- clutter
- dense restaurant grids
- "cheap delivery app" appearance

---

# Discovery

Discovery should become one of the platform's strongest features.

Allow browsing by multiple perspectives.

Examples:

## Browse Sellers

Independent creators.

## Browse Meals

Individual dishes.

## Browse Categories

Desserts

Breakfast

Lunch

Dinner

Drinks

Snacks

Holiday Specials

Baked Goods

etc.

## Nearby

Discover nearby sellers.

## Recently Added

Newest listings.

## Trending

Meals gaining attention.

## Following

Content from sellers the customer follows.

## Seasonal

Christmas

Mother's Day

Easter

etc.

---

# Stories

Stories should become a major engagement feature.

Purpose:

Help sellers stay visible without creating pressure to constantly produce inventory.

Stories may include:

"I'm baking today."

"Fresh cookies just finished."

"Accepting orders until 4pm."

"Weekend menu available."

"Holiday specials now open."

"Testing a new recipe."

Customers should browse stories similarly to modern social apps.

Stories naturally support:

- following sellers
- notifications
- engagement
- trust

Stories are NOT intended to communicate live inventory.

---

# Seller Profiles

Profiles should feel personal.

Include:

Profile photo

Cover photo

Biography

Location

Languages

Specialties

Gallery

Current offerings

Story highlights

Reviews

Followers

Availability

---

# Selling Models

The platform should support multiple selling styles.

Examples:

Individual meals.

Daily menus.

Weekly menus.

Meal packages.

Family packages.

Party trays.

Custom orders.

Holiday specials.

Limited-time offers.

The architecture should support all without assuming one is primary.

---

# Availability

Instead of real-time inventory.

Support flexible availability.

Examples:

Today

Tomorrow

Weekends

By pre-order

Holiday only

Seasonal

Custom dates

This reduces food waste and seller pressure.

---

# Search

Support searching by:

Meal

Category

Ingredient

Seller

Area

Price

Availability

Dietary preferences

Popularity

Newest

Nearby

---

# Saved Content

Customers should be able to:

Follow sellers.

Save meals.

Create collections.

Examples:

Birthday ideas.

Desserts.

Lunch.

Weekend meals.

Christmas.

---

# Repeat Customers

Encourage repeat business.

Examples:

Order again.

Recently ordered.

Your favourite sellers.

Recommended based on previous orders.

---

# Seller Dashboard

Dashboard should focus on helping sellers make better business decisions.

Include:

Orders

Followers

Popular meals

Profile views

Repeat customers

Reviews

Saved meals

---

# Seller Insights

One of the platform's signature features.

The platform should anonymously analyse customer demand.

Examples:

People near you searched for:

Lasagna

Cheesecake

Brownies

Nobody nearby currently sells these.

---

Or:

Most searches occur:

Saturday morning

Friday evening

Sunday lunch

---

Provide actionable recommendations.

Help sellers decide what to prepare.

This is intended to increase income, not simply provide analytics.

---

# Customer Requests

Allow customers to post food requests.

Examples:

Need birthday cupcakes.

Need catering.

Looking for homemade bread.

Looking for desserts for Saturday.

Nearby sellers may respond.

---

# Booking / Ordering

Simple.

No delivery routing.

Support:

Pickup.

Seller delivery.

Meet-up.

Future expansion should be possible without redesign.

---

# Notifications

Phase 1

Email

PWA

Future

SMS

WhatsApp

---

# Future Features

Subscriptions.

Meal plans.

Gift cards.

Online payments.

Referral program.

Loyalty.

Marketplace promotions.

---

# Technical Goals

Design a modular architecture.

Support phased implementation.

Avoid overengineering.

Design for long-term maintainability.

---

# Deliverable Requested

Produce a complete architecture and implementation plan.

Include:

- Information architecture
- UX flows
- Sitemap
- Database design
- API design
- Entity relationships
- Discovery architecture
- Story system
- Search architecture
- Recommendation engine
- Seller analytics
- Customer request workflow
- Notification architecture
- Security considerations
- Mobile-first UX
- Future extensibility

One additional design goal:

Continuously ask:

> "Does this feature help independent food creators earn more reliable income without significantly increasing operational burden or food waste?"

This principle should guide architectural decisions throughout the project.

----
Global Apps to study conceptually for inspiration (suggested by ChatGPT))

Airbnb → Discovery, photography, trust, profiles.
Pinterest → Browsing, collections, visual inspiration.
Instagram → Stories, following creators, engagement.
Etsy → Independent sellers, shop pages, reviews, personalization.
Too Good To Go → Availability windows and reducing waste (not the business model, but some UX patterns are relevant).