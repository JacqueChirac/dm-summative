import { relations } from 'drizzle-orm';
import {
	boolean,
	date,
	foreignKey,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp
} from 'drizzle-orm/pg-core';

// Countries
export const countries = pgTable('countries', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique(),
	code: text('code').notNull().unique() // ISO country code
});

export const countriesRelations = relations(countries, ({ many }) => ({
	jurisdictions: many(jurisdictions)
}));

// Electoral Systems (Voting Systems: FPTP, PR, etc.)
export const electoralSystems = pgEnum('electoral_systems', [
	'FPTP', // First Past the Post - Single-member plurality system
	'PR', // Proportional Representation - Seats allocated proportionally
	'STV', // Single Transferable Vote - Multi-member preferential voting
	'IRV', // Instant Runoff Voting - Single-member preferential voting
	'MMP', // Mixed Member Proportional - Combination of FPTP and PR
	'TRS', // Two-Round System - Majority required or runoff election
	'FTRS', // French Two-Round System - TRS variant used in France
	'AV', // Alternative Vote - Single-member preferential (similar to IRV)
	'LIST', // Party-List Proportional - Proportional using party lists
	'OPEN_LIST', // Open List - Voters can influence candidate order on lists
	'CLOSED_LIST', // Closed List - Party determines candidate order on lists
	'PLURALITY', // Plurality at Large - Multiple candidates by plurality
	'BLOCK', // Block Vote - Voters choose multiple candidates
	'AMS', // Additional Member System - Mixed system with top-up seats
	'PMES', // Paris Municipal Electoral System - Two-round list PR with bonus
	'MSMMDS', // Mixed Single and Multi-Member District System
	'DMC', // Dual Member Constituencies - Two members per constituency
	'MMD' // Multi-Member Districts - All districts elect multiple representatives
]);

// Jurisdictions (provinces, states, etc.)
export const jurisdictions = pgTable('jurisdictions', {
	id: serial('id').primaryKey(),
	countryId: integer('country_id')
		.notNull()
		.references(() => countries.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	name: text('name').notNull(),
	code: text('code').notNull(),
	type: text('type').notNull(), // 'federal', 'provincial', 'territorial', 'municipal'
	electoralSystem: electoralSystems('electoral_system').notNull(), // What electoral system this jurisdiction uses
	seatCount: integer('seat_count'),
	orderIndex: integer('order_index').notNull().default(0)
});

export const jurisdictionsRelations = relations(jurisdictions, ({ one, many }) => ({
	country: one(countries, {
		fields: [jurisdictions.countryId],
		references: [countries.id]
	}),
	regions: many(regions),
	constituencies: many(constituencies),
	elections: many(elections),
	parties: many(parties),
	polls: many(polls),
	censuses: many(censuses),
	pollsters: many(pollsters),
	electionProjections: many(projectionsElection)
}));

// Regions (groupings of ridings)
export const regions = pgTable('regions', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	code: text('code').notNull(),
	type: text('type').notNull(), // 'region', 'subregion', etc.
	jurisdictionId: integer('jurisdiction_id')
		.notNull()
		.references(() => jurisdictions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	parentRegionId: integer('parent_region_id'),
	parentRegionCode: text('parent_region_code'),
	orderIndex: integer('order_index').notNull().default(0)
});

export const regionsRelations = relations(regions, ({ one, many }) => ({
	jurisdiction: one(jurisdictions, {
		fields: [regions.jurisdictionId],
		references: [jurisdictions.id]
	}),
	parentRegion: one(regions, {
		fields: [regions.parentRegionId],
		references: [regions.id],
		relationName: 'regionHierarchy'
	}),
	childRegions: many(regions, { relationName: 'regionHierarchy' }),
	constituencies: many(constituencies)
}));

// Parties
export const parties = pgTable('parties', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	acronym: text('acronym').notNull(),
	simpleAcronym: text('simple_acronym'),
	jurisdictionId: integer('jurisdiction_id')
		.notNull()
		.references(() => jurisdictions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	primaryColor: text('primary_color').notNull(),
	gradientColors: jsonb('gradient_colors').$type<string[]>(),
	founded: date('founded'),
	dissolved: date('dissolved'),
	active: boolean('active').notNull().default(true),
	metadata: jsonb('metadata').$type<{
		leader?: string;
		ideology?: string[];
		website?: string;
		logo?: string;
		ideology_rank?: number;
	}>()
});

export const partiesRelations = relations(parties, ({ one, many }) => ({
	jurisdiction: one(jurisdictions, {
		fields: [parties.jurisdictionId],
		references: [jurisdictions.id]
	}),
	pollResults: many(pollResults)
}));

// Constituencies (electoral districts)
export const constituencies = pgTable('constituencies', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	code: text('code').notNull(),
	jurisdictionId: integer('jurisdiction_id')
		.notNull()
		.references(() => jurisdictions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	// Geographic data from CSV files
	subnational: text('subnational'), // e.g., "BC", "QC" - province/state code
	region: text('region'), // e.g., "VI", "LM" - region code within province
	subregion: text('subregion'), // e.g., "GVA", "RVN" - subregion code
	regionId: integer('region_id').references(() => regions.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}),
	subnationalId: integer('subnational_id').references(() => regions.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}), // FK to regions table for subnational entity
	subregionId: integer('subregion_id').references(() => regions.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}), // FK to regions table for subregion entity
	orderIndex: integer('order_index').notNull().default(0),
	metadata: jsonb('metadata').$type<{
		population?: number;
		registeredVoters?: number;
		area?: number;
	}>()
});

export const constituenciesRelations = relations(constituencies, ({ one, many }) => ({
	jurisdiction: one(jurisdictions, {
		fields: [constituencies.jurisdictionId],
		references: [jurisdictions.id]
	}),
	region: one(regions, {
		fields: [constituencies.regionId],
		references: [regions.id]
	}),
	// New geographic relations
	subnationalRegion: one(regions, {
		fields: [constituencies.subnationalId],
		references: [regions.id],
		relationName: 'constituencySubnational'
	}),
	subregionRegion: one(regions, {
		fields: [constituencies.subregionId],
		references: [regions.id],
		relationName: 'constituencySubregion'
	}),
	electionResults: many(electionResults),
	constituencyDemographics: many(demographicsGeographic)
}));

// Elections
export const elections = pgTable('elections', {
	id: serial('id').primaryKey(),
	code: text('code'), // Optional election code identifier
	jurisdictionId: integer('jurisdiction_id')
		.notNull()
		.references(() => jurisdictions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	electoralSystem: electoralSystems('electoral_system'), // Electoral system used for this election
	name: text('name').notNull(),
	startDate: date('start_date').notNull(),
	endDate: date('end_date').notNull(),
	type: text('type').notNull(), // 'general', 'by-election', 'leadership'
	turnout: numeric('turnout', { precision: 5, scale: 2 }), // Voter turnout percentage
	registeredVoters: integer('registered_voters'), // Number of registered voters
	totalVotes: integer('total_votes'), // Total votes cast
	totalValidVotes: integer('total_valid_votes'), // Total valid votes (excluding rejected ballots)
	sources: jsonb('sources').$type<{
		electionSource?: string; // URL or reference to election information
		voteSource?: string; // URL or reference to vote data
	}>()
});

export const electionsRelations = relations(elections, ({ one, many }) => ({
	jurisdiction: one(jurisdictions, {
		fields: [elections.jurisdictionId],
		references: [jurisdictions.id]
	}),
	electionResults: many(electionResults)
}));

// ==================== Polling Tables ====================

// Pollsters - Using CSV ID as primary key for direct mapping
export const pollsters = pgTable('pollsters', {
	id: integer('id').primaryKey(), // Now using CSV ID directly instead of serial
	name: text('name').notNull().unique(),
	website: text('website'),
	jurisdictionId: integer('jurisdiction_id')
		.notNull()
		.references(() => jurisdictions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	rating: numeric('rating', { precision: 5, scale: 2 }), // Removed .notNull() - some pollsters don't have ratings yet
	accuracy: numeric('accuracy', { precision: 5, scale: 2 }), // Historical accuracy %
	lastUpdated: date('last_updated'), // When rating was last updated
	metadata: jsonb('metadata').$type<{
		notes?: string;
		methodology?: string;
		biasDirection?: string; // 'left', 'right', 'neutral'
		averageError?: number;
		trackRecord?: string[];
		founded?: string;
		headquarters?: string;
	}>()
});

export const pollstersRelations = relations(pollsters, ({ one, many }) => ({
	jurisdiction: one(jurisdictions, {
		fields: [pollsters.jurisdictionId],
		references: [jurisdictions.id]
	}),
	polls: many(polls)
}));

// Polls - Enhanced structure for complex polling data
export const polls = pgTable('polls', {
	id: serial('id').primaryKey(),
	serialId: integer('serial_id').notNull(),
	pollsterId: integer('pollster_id')
		.notNull()
		.references(() => pollsters.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	jurisdictionId: integer('jurisdiction_id')
		.notNull()
		.references(() => jurisdictions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	startDate: date('start_date'), // When fieldwork started
	endDate: date('end_date'), // When fieldwork ended
	sampleSize: integer('sample_size').notNull(),
	marginOfError: numeric('margin_of_error', { precision: 3, scale: 1 }),
	methodology: text('methodology').notNull(), // 'Online', 'Telephone', 'IVR', etc.
	source: text('source'), // URL or reference
	isRolling: boolean('is_rolling').notNull().default(false), // Rolling poll indicator
	rollingPeriod: text('rolling_period'), // '4 Weeks Rolling', etc.
	weight: numeric('weight', { precision: 5, scale: 2 }), // Poll weight for rolling polls (e.g., 0.25)
	metadata: jsonb('metadata').$type<{
		notes?: string;
		originalId?: string; // For data lineage
	}>()
});

export const pollsRelations = relations(polls, ({ one, many }) => ({
	pollster: one(pollsters, {
		fields: [polls.pollsterId],
		references: [pollsters.id]
	}),
	jurisdiction: one(jurisdictions, {
		fields: [polls.jurisdictionId],
		references: [jurisdictions.id]
	}),
	results: many(pollResults)
}));

// Poll Questions - Template questions that can be reused across multiple polls
export const pollQuestions = pgTable('poll_questions', {
	id: integer('id').primaryKey(),
	section: text('section').notNull(), // 'Vote Intention', 'Leadership Ratings', etc.
	subsection: text('subsection'), // 'Regions', 'Gender', 'Age', etc.
	question: text('question').notNull(), // 'vote intention', 'best pm', etc.
	title: text('title').notNull(), // Display title: 'Federal', 'Male', 'British Columbia'
	demographicFilter: text('demographic_filter').notNull().default('All'), // 'Male', '18-34', 'All'
	regionFilter: text('region_filter').notNull().default('All'), // 'BC', 'ON', 'All'
	orderIndex: integer('order_index').notNull().default(0),
	metadata: jsonb('metadata').$type<{
		filterCombination?: string; // For complex filters
		description?: string; // Question description
	}>()
});

export const pollQuestionsRelations = relations(pollQuestions, ({ many }) => ({
	results: many(pollResults)
}));

// Poll Results - CSV structure with foreign key matching
export const pollResults = pgTable('poll_results', {
	id: serial('id').primaryKey(),
	// Direct CSV columns
	serialId: integer('serial_id').notNull(), // 1
	date: date('date').notNull(), // 2025-05-02
	question: text('question').notNull(), // "vote intention"
	voters: text('voters').notNull(), // "Decided"
	optionKey: text('option_key').notNull(), // "BQ" - ONE option per row
	percentage: jsonb('percentage').notNull(), // 6.9 - ONE percentage value per row (stored as JSONB but contains single numeric)
	demoFilter: text('demo_filter').notNull(), // "All"
	regionFilter: text('region_filter').notNull(), // "All"
	sampleSize: integer('sample_size'), // 1297 or NULL for "Unknown"
	sum: numeric('sum', { precision: 5, scale: 2 }), // Optional sum column

	// Foreign keys populated through matching
	questionId: integer('question_id').references(() => pollQuestions.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}), // Matched by (question, demoFilter, regionFilter)
	optionId: integer('option_id').references(() => pollOptions.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}), // Matched by optionKey
	pollsterId: integer('pollster_id').references(() => pollsters.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade'
	}), // 2, Matched by pollsterIdCsv

	metadata: jsonb('metadata').$type<{
		originalValue?: number;
		notes?: string;
	}>()
});

export const pollResultsRelations = relations(pollResults, ({ one }) => ({
	pollster: one(pollsters, {
		fields: [pollResults.pollsterId],
		references: [pollsters.id]
	}),
	question: one(pollQuestions, {
		fields: [pollResults.questionId],
		references: [pollQuestions.id]
	}),
	option: one(pollOptions, {
		fields: [pollResults.optionId],
		references: [pollOptions.id]
	})
}));

// Poll Options - Comprehensive option categorization system
export const pollOptions = pgTable('poll_options', {
	id: integer('id').primaryKey(),
	section: text('section').notNull(), // 'Political Parties', 'Party Leaders', 'Issue Topics', etc.
	optionKey: text('option_key').notNull(), // 'CPC', 'Pierre Poilievre', 'Economy', etc.
	displayName: text('display_name').notNull(), // 'Conservative Party', 'Pierre Poilievre', etc.
	colorHex: text('color_hex'), // '#006cd1', '#D71921', etc.
	metadata: jsonb('metadata').$type<{
		aliases?: string[]; // Alternative names for same option
		category?: string; // Additional categorization
	}>()
});

export const pollOptionsRelations = relations(pollOptions, ({ many }) => ({
	pollResults: many(pollResults)
}));

// ==================== Election Results ====================

// Vote Types Enum - Different types of voting methods
export const voteTypes = pgEnum('vote_types', [
	'ED', // Election Day
	'ADV', // Advance Voting
	'MAIL', // Mail-in Ballot
	'SPECIAL', // Special Ballot
	'REMOTE', // Remote Voting
	'ALL' // All votes combined
]);

// Polling Divisions - Granular polling location results
export const pollingDivisions = pgTable('polling_divisions', {
	id: serial('id').primaryKey(),
	pdNum: integer('pd_num'), // Polling division number (NULL for special/non-numeric divisions)
	pdName: text('pd_name').notNull(), // Polling division name
	pdCode: text('pd_code').notNull(), // Unique code (e.g., "10001_1-0")

	// Foreign keys
	constituencyId: integer('constituency_id')
		.notNull()
		.references(() => constituencies.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	electionId: integer('election_id')
		.notNull()
		.references(() => elections.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

	// Vote metadata
	voteType: voteTypes('vote_type').notNull().default('ED'), // Type of votes (Election Day, Advance, etc.)
	totalVotes: integer('total_votes').notNull(),

	// Winner analysis
	winner: text('winner').notNull(), // Winning party acronym
	margin: numeric('margin', { precision: 5, scale: 4 }).notNull(), // Victory margin as decimal

	// Party results - stored as JSONB for flexibility
	partyResults: jsonb('party_results')
		.$type<
			Array<{
				partyCode: string;
				votes: number;
				percentage: number;
			}>
		>()
		.notNull(),

	metadata: jsonb('metadata').$type<{
		provincialCode?: string; // Province/territory code from CSV
		constituencyCode?: string; // Riding ID from CSV (e.g., "10001")
		constituencyName?: string; // Riding name for reference
		originalPdNum?: string; // Original PD_Num from CSV (for non-numeric values like 'S/R 1')
		notes?: string;
	}>()
});

export const pollingDivisionsRelations = relations(pollingDivisions, ({ one }) => ({
	constituency: one(constituencies, {
		fields: [pollingDivisions.constituencyId],
		references: [constituencies.id]
	}),
	election: one(elections, {
		fields: [pollingDivisions.electionId],
		references: [elections.id]
	})
}));

// Election Results
export const electionResults = pgTable('election_results', {
	id: serial('id').primaryKey(),
	electionId: integer('election_id')
		.notNull()
		.references(() => elections.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	constituencyId: integer('constituency_id')
		.notNull()
		.references(() => constituencies.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	repOrder: integer('rep_order').notNull().default(1), // Redistribution order (1 = original, 2 = redistribution)
	isByElection: boolean('is_by_election').notNull().default(false), // TRUE for by-elections, FALSE for general elections
	totalVotes: integer('total_votes').notNull(),
	eligibleVoters: integer('eligible_voters'),
	rejectedBallots: integer('rejected_ballots'), // Rejected/spoiled ballots
	turnout: numeric('turnout', { precision: 5, scale: 2 }),
	partyResults: jsonb('party_results')
		.$type<
			Array<{
				partyCode: string;
				partyName: string;
				candidateName?: string;
				votes: number;
				percentage: number;
				isWinner: boolean;
				isIncumbent?: boolean;
			}>
		>()
		.notNull(),
	metadata: jsonb('metadata').$type<{
		advanceVotes?: number;
		recountRequested?: boolean;
		notes?: string;
	}>()
});

export const electionResultsRelations = relations(electionResults, ({ one }) => ({
	election: one(elections, {
		fields: [electionResults.electionId],
		references: [elections.id]
	}),
	constituency: one(constituencies, {
		fields: [electionResults.constituencyId],
		references: [constituencies.id]
	})
}));

// Election Results by Region - Aggregated regional voting data for hierarchical analysis
export const electionResultsRegions = pgTable('election_results_regions', {
	id: serial('id').primaryKey(),
	electionId: integer('election_id')
		.notNull()
		.references(() => elections.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	jurisdictionId: integer('jurisdiction_id')
		.notNull()
		.references(() => jurisdictions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

	// Geographic hierarchy - exactly what the simulator expects
	region: text('region'), // 'CGY', 'EDM', 'ROA', etc.
	subnational: text('subnational'), // 'AB', 'BC', 'ON', etc.
	subregion: text('subregion'), // 'NECGY', 'GCA', 'NRA', etc.
	year: integer('year').notNull(), // Election year for easy filtering

	// Foreign key reference to regions table for proper relationships
	regionId: integer('region_id').references(() => regions.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}),

	// Aggregated vote data by party
	partyResults: jsonb('party_results')
		.$type<
			Array<{
				partyCode: string;
				partyName: string;
				votes: number;
				percentage: number;
				seats?: number; // Number of seats won in this region
			}>
		>()
		.notNull(),

	// Regional totals
	totalVotes: integer('total_votes').notNull(),
	totalSeats: integer('total_seats'), // Total seats in this region
	constituencies: integer('constituencies'), // Number of constituencies in this region

	metadata: jsonb('metadata').$type<{
		aggregationLevel?: string; // 'regional', 'subnational', 'subregional'
		sourceConstituencies?: number[]; // Array of constituency IDs that were aggregated
		notes?: string;
	}>()
});

export const electionResultsRegionsRelations = relations(electionResultsRegions, ({ one }) => ({
	election: one(elections, {
		fields: [electionResultsRegions.electionId],
		references: [elections.id]
	}),
	jurisdiction: one(jurisdictions, {
		fields: [electionResultsRegions.jurisdictionId],
		references: [jurisdictions.id]
	}),
	regionRef: one(regions, {
		fields: [electionResultsRegions.regionId],
		references: [regions.id],
		relationName: 'electionRegion'
	})
}));

// Election Projections - Main projection metadata
export const projectionsElection = pgTable('projections_election', {
	id: serial('id').primaryKey(),
	jurisdictionId: integer('jurisdiction_id')
		.notNull()
		.references(() => jurisdictions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	name: text('name').notNull(), // "2025 Federal Projection - Final"
	methodology: text('methodology').notNull(), // "monte_carlo", "swing_model"
	createdAt: timestamp('created_at').defaultNow().notNull(),
	metadata: jsonb('metadata').$type<{
		pollCount?: number;
		lastPollDate?: string;
		baselineYear?: number;
		notes?: string;
	}>()
});

export const projectionsElectionRelations = relations(projectionsElection, ({ one, many }) => ({
	jurisdiction: one(jurisdictions, {
		fields: [projectionsElection.jurisdictionId],
		references: [jurisdictions.id]
	}),
	generalProjections: many(projectionsGeneral),
	regionalProjections: many(projectionsRegional),
	constituencyProjections: many(projectionsConstituency),
	accuracyEvaluations: many(projectionAccuracy)
}));

// General Projections - National-level summary
export const projectionsGeneral = pgTable('projections_general', {
	id: serial('id').primaryKey(),
	projectionId: integer('projection_id')
		.notNull()
		.references(() => projectionsElection.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	party: text('party').notNull(),
	seats: integer('seats').notNull(),
	votePercentage: numeric('vote_percentage', { precision: 5, scale: 2 }).notNull(),
	seatMin: integer('seat_min'), // 95% confidence interval
	seatMax: integer('seat_max'),
	governmentProbability: numeric('government_probability', { precision: 5, scale: 2 }), // Chance of forming government
	seatHistogram: jsonb('seat_histogram').$type<Record<string, number>>() // Seat count -> probability distribution from Monte Carlo
});

export const projectionsGeneralRelations = relations(projectionsGeneral, ({ one }) => ({
	projection: one(projectionsElection, {
		fields: [projectionsGeneral.projectionId],
		references: [projectionsElection.id]
	})
}));

// Regional Projections - Province/state/region level
export const projectionsRegional = pgTable('projections_regional', {
	id: serial('id').primaryKey(),
	projectionId: integer('projection_id')
		.notNull()
		.references(() => projectionsElection.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	regionId: integer('region_id')
		.notNull()
		.references(() => regions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	regionName: text('region_name').notNull(),
	party: text('party').notNull(),
	seats: integer('seats').notNull(),
	votePercentage: numeric('vote_percentage', { precision: 5, scale: 2 }).notNull(),
	seatMin: integer('seat_min'),
	seatMax: integer('seat_max'),
	seatHistogram: jsonb('seat_histogram').$type<Record<string, number>>() // Regional seat histograms from Monte Carlo
});

export const projectionsRegionalRelations = relations(projectionsRegional, ({ one }) => ({
	projection: one(projectionsElection, {
		fields: [projectionsRegional.projectionId],
		references: [projectionsElection.id]
	}),
	region: one(regions, {
		fields: [projectionsRegional.regionId],
		references: [regions.id]
	})
}));

// Constituency Projections - Riding-level detailed projections
export const projectionsConstituency = pgTable('projections_constituency', {
	id: serial('id').primaryKey(),

	// Projection metadata
	projectionId: integer('projection_id')
		.notNull()
		.references(() => projectionsElection.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

	// Constituency identification
	constituencyId: integer('constituency_id')
		.notNull()
		.references(() => constituencies.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	constituencyName: text('constituency_name').notNull(),

	// Geographic hierarchy (proper foreign keys to regions table)
	regionId: integer('region_id').references(() => regions.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}),
	subnationalId: integer('subnational_id').references(() => regions.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}),
	subregionId: integer('subregion_id').references(() => regions.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}),

	// Text codes for backward compatibility and display
	regionCode: text('region_code'),
	subnationalCode: text('subnational_code'),
	subregionCode: text('subregion_code'),

	// Vote totals and sampling
	totalVotes: integer('total_votes'),
	effectiveSampleSize: integer('effective_sample_size'),

	// Winner analysis
	projectedWinner: text('projected_winner').notNull(),
	previousWinner: text('previous_winner'),
	margin: numeric('margin', { precision: 5, scale: 2 }).notNull(),

	// Party-specific projection data
	party: text('party').notNull(),
	votes: integer('votes'),
	votePercentage: numeric('vote_percentage', { precision: 5, scale: 2 }).notNull(),
	marginOfError: numeric('margin_of_error', { precision: 5, scale: 2 }),
	winProbability: numeric('win_probability', { precision: 5, scale: 2 })
});

export const projectionsConstituencyRelations = relations(projectionsConstituency, ({ one }) => ({
	projection: one(projectionsElection, {
		fields: [projectionsConstituency.projectionId],
		references: [projectionsElection.id]
	}),
	constituency: one(constituencies, {
		fields: [projectionsConstituency.constituencyId],
		references: [constituencies.id]
	}),
	region: one(regions, {
		fields: [projectionsConstituency.regionId],
		references: [regions.id],
		relationName: 'projectionRegion'
	}),
	subnationalRegion: one(regions, {
		fields: [projectionsConstituency.subnationalId],
		references: [regions.id],
		relationName: 'projectionSubnational'
	}),
	subregionRegion: one(regions, {
		fields: [projectionsConstituency.subregionId],
		references: [regions.id],
		relationName: 'projectionSubregion'
	})
})); // Projection Accuracy - Post-election evaluation of projection performance
export const projectionAccuracy = pgTable('projections_accuracy', {
	id: serial('id').primaryKey(),
	electionId: integer('election_id').references(() => elections.id, {
		onDelete: 'set null',
		onUpdate: 'cascade'
	}),

	// Election identification
	electionName: text('election_name').notNull(), // "2024 BC", "2024 NB", "2025 ON"

	// Overall accuracy percentage
	overallAccuracy: numeric('overall_accuracy', { precision: 5, scale: 2 }).notNull(), // 86%, 90%, etc.

	// Projected seat counts by party
	projectedSeats: jsonb('projected_seats')
		.$type<Record<string, number>>() // {"CON": 46, "NDP": 45, "GRN": 2}
		.notNull(),

	// Actual election results by party
	actualSeats: jsonb('actual_seats')
		.$type<Record<string, number>>() // {"NDP": 47, "CON": 44, "GRN": 2}
		.notNull(),

	// Error analysis
	errorMetrics: jsonb('error_metrics').$type<{
		seatErrors: Record<string, { predicted: number; actual: number; error: number }>;
		avgMarginError: number;
		systematicBias?: Record<string, number>; // party -> bias
		correctPredictions: number;
		incorrectPredictions: number;
		totalSeatsProjected: number;
		totalSeatsActual: number;
		seatErrorSum: number; // Sum of absolute seat errors
	}>(),

	// External reference
	referenceLink: text('reference_link'), // Link to election results or analysis

	notes: text('notes')
});

export const projectionAccuracyRelations = relations(projectionAccuracy, ({ one }) => ({
	election: one(elections, {
		fields: [projectionAccuracy.electionId],
		references: [elections.id]
	})
}));

// ==================== Demographics ====================

// Census Demographics - Master table for census years and jurisdictions
export const censuses = pgTable('censuses', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(), // "2021 Canada Census", "2016 Canada Census"
	year: integer('year').notNull(),
	jurisdictionId: integer('jurisdiction_id')
		.notNull()
		.references(() => jurisdictions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	conductedBy: text('conducted_by').notNull(), // "Statistics Canada", "US Census Bureau"
	referenceDate: date('reference_date').notNull(), // Official census reference date
	totalPopulation: integer('total_population'), // Total population counted
	responseRate: numeric('response_rate', { precision: 5, scale: 2 }), // Overall response rate
	metadata: jsonb('metadata').$type<{
		languages?: string[]; // Languages census was conducted in
		questionsCount?: number; // Number of questions in census
		samplingMethod?: string; // "complete enumeration", "sample survey"
		digitalParticipation?: number; // Percentage who responded online
		notes?: string;
		officialUrl?: string; // Link to official census results
	}>()
});

export const censusesRelations = relations(censuses, ({ one, many }) => ({
	jurisdiction: one(jurisdictions, {
		fields: [censuses.jurisdictionId],
		references: [jurisdictions.id]
	}),
	demographicCategories: many(demographicCategories),
	constituencyDemographics: many(demographicsGeographic),
	demographicStats: many(demographicStats)
}));

// Demographic Categories
export const demographicCategories = pgTable('demographic_categories', {
	id: serial('id').primaryKey(),
	censusId: integer('census_id')
		.notNull()
		.references(() => censuses.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	category: text('category').notNull(),
	subcategory: text('subcategory'),
	subsubcategory: text('subsubcategory'),
	characteristicsId: text('characteristics_id').notNull(),
	isProvince: boolean('is_province'), // Whether this is provincial-level data
	description: text('description'),
	metadata: jsonb('metadata').$type<{
		unit?: string;
		source?: string;
		lastUpdated?: string;
		values?: {
			count_total?: number;
			count_men?: number;
			count_women?: number;
			rate_total?: number;
			rate_men?: number;
			rate_women?: number;
		};
	}>()
});

export const demographicCategoriesRelations = relations(demographicCategories, ({ one, many }) => ({
	census: one(censuses, {
		fields: [demographicCategories.censusId],
		references: [censuses.id]
	}),
	geographicDemographics: many(demographicsGeographic),
	demographicStats: many(demographicStats)
}));

// Geographic Demographics (renamed from constituency_demographics)
export const demographicsGeographic = pgTable(
	'demographics_geographic',
	{
		id: serial('id').primaryKey(),
		constituencyId: integer('constituency_id').references(() => constituencies.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade'
		}),
		censusId: integer('census_id').notNull(),
		categoryId: integer('category_id').notNull(),
		characteristicsId: text('characteristics_id'), // ✅ Statistics Canada characteristic ID for sorting/filtering
		geographics_id: integer('geographics_id'),
		isConstituency: boolean('is_constituency').notNull().default(false), // TRUE for constituency-level data, FALSE for provincial/national
		values: jsonb('values')
			.$type<{
				total?: number;
				men?: number;
				women?: number;
				rateTotal?: number;
				rateMen?: number;
				rateWomen?: number;
				breakdown?: Record<string, number>;
			}>()
			.notNull(),
		metadata: jsonb('metadata').$type<{
			source?: string;
			notes?: string;
			confidence?: string;
			sgcCode?: number; // Statistics Canada Standard Geographic Code
			geoName?: string; // Geographic name
		}>()
	},
	(table) => [
		foreignKey({
			columns: [table.categoryId],
			foreignColumns: [demographicCategories.id],
			name: 'demographics_geographic_category_fk'
		})
			.onDelete('cascade')
			.onUpdate('cascade'),
		foreignKey({
			columns: [table.censusId],
			foreignColumns: [censuses.id],
			name: 'demographics_geographic_census_fk'
		})
			.onDelete('cascade')
			.onUpdate('cascade')
	]
);

export const demographicsGeographicRelations = relations(demographicsGeographic, ({ one }) => ({
	constituency: one(constituencies, {
		fields: [demographicsGeographic.constituencyId],
		references: [constituencies.id]
	}),
	census: one(censuses, {
		fields: [demographicsGeographic.censusId],
		references: [censuses.id]
	}),
	category: one(demographicCategories, {
		fields: [demographicsGeographic.categoryId],
		references: [demographicCategories.id]
	})
}));

// Demographic Statistics
export const demographicStats = pgTable('demographic_stats', {
	id: serial('id').primaryKey(),
	categoryId: integer('category_id')
		.notNull()
		.references(() => demographicCategories.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	censusId: integer('census_id')
		.notNull()
		.references(() => censuses.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	jurisdictionId: integer('jurisdiction_id').references(() => jurisdictions.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade'
	}),
	characteristicsId: text('characteristics_id'),
	stats: jsonb('stats')
		.$type<{
			mean: number;
			median?: number;
			stdDev: number;
			min?: number;
			max?: number;
			percentiles?: Record<string, number>;
			constituencyCount: number;
		}>()
		.notNull()
});

export const demographicStatsRelations = relations(demographicStats, ({ one }) => ({
	category: one(demographicCategories, {
		fields: [demographicStats.categoryId],
		references: [demographicCategories.id]
	}),
	census: one(censuses, {
		fields: [demographicStats.censusId],
		references: [censuses.id]
	}),
	jurisdiction: one(jurisdictions, {
		fields: [demographicStats.jurisdictionId],
		references: [jurisdictions.id]
	})
}));

// Demographic Importance
export const demographicImportance = pgTable('demographic_importance', {
	id: serial('id').primaryKey(),
	categoryId: integer('category_id')
		.notNull()
		.references(() => demographicCategories.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	type: text('type').notNull(), // 'political', 'economic', 'social'
	importance: text('importance').notNull(), // 'high', 'medium', 'low'
	demoCategory: text('demo_category').notNull(), // From old demo_importance.demo_category
	characteristicsId: text('characteristics_id')
});

export const demographicImportanceRelations = relations(demographicImportance, ({ one }) => ({
	category: one(demographicCategories, {
		fields: [demographicImportance.categoryId],
		references: [demographicCategories.id]
	})
}));

// Type exports
export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;

export type Jurisdiction = typeof jurisdictions.$inferSelect;
export type NewJurisdiction = typeof jurisdictions.$inferInsert;

export type Region = typeof regions.$inferSelect;
export type NewRegion = typeof regions.$inferInsert;

export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;

export type Constituency = typeof constituencies.$inferSelect;
export type NewConstituency = typeof constituencies.$inferInsert;

export type Election = typeof elections.$inferSelect;
export type NewElection = typeof elections.$inferInsert;

export type Pollster = typeof pollsters.$inferSelect;
export type NewPollster = typeof pollsters.$inferInsert;

export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;

export type PollQuestion = typeof pollQuestions.$inferSelect;
export type NewPollQuestion = typeof pollQuestions.$inferInsert;

export type PollResult = typeof pollResults.$inferSelect;
export type NewPollResult = typeof pollResults.$inferInsert;

export type ElectionResult = typeof electionResults.$inferSelect;
export type NewElectionResult = typeof electionResults.$inferInsert;

export type ProjectionElection = typeof projectionsElection.$inferSelect;
export type NewProjectionElection = typeof projectionsElection.$inferInsert;

export type ProjectionConstituency = typeof projectionsConstituency.$inferSelect;
export type NewProjectionConstituency = typeof projectionsConstituency.$inferInsert;

export type ProjectionGeneral = typeof projectionsGeneral.$inferSelect;
export type NewProjectionGeneral = typeof projectionsGeneral.$inferInsert;

export type ProjectionRegional = typeof projectionsRegional.$inferSelect;
export type NewProjectionRegional = typeof projectionsRegional.$inferInsert;

export type ProjectionAccuracy = typeof projectionAccuracy.$inferSelect;
export type NewProjectionAccuracy = typeof projectionAccuracy.$inferInsert;

export type Census = typeof censuses.$inferSelect;
export type NewCensus = typeof censuses.$inferInsert;

export type DemographicCategory = typeof demographicCategories.$inferSelect;
export type NewDemographicCategory = typeof demographicCategories.$inferInsert;

export type DemographicGeographic = typeof demographicsGeographic.$inferSelect;
export type NewDemographicGeographic = typeof demographicsGeographic.$inferInsert;

export type DemographicStat = typeof demographicStats.$inferSelect;
export type NewDemographicStat = typeof demographicStats.$inferInsert;

export type DemographicImportance = typeof demographicImportance.$inferSelect;
export type NewDemographicImportance = typeof demographicImportance.$inferInsert;

export type PollOption = typeof pollOptions.$inferSelect;
export type NewPollOption = typeof pollOptions.$inferInsert;

export type PollingDivision = typeof pollingDivisions.$inferSelect;
export type NewPollingDivision = typeof pollingDivisions.$inferInsert;
