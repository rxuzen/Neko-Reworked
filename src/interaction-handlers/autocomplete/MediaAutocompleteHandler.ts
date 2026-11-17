import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { AutocompleteInteraction } from 'discord.js';
import { SCHEDULE_DAYS } from '../../commands/media/schedule.ts';
import { autocompleteCharacter, autocompleteMedia } from '../../services/anilist.service.ts';
import { SOCIAL_ACTIONS, SOCIAL_ACTION_META } from '../../services/media.service.ts';

export class MediaAutocompleteHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Autocomplete,
		});
	}

	public override async parse(interaction: AutocompleteInteraction) {
		const { commandName } = interaction;
		const focused = interaction.options.getFocused(true);

		if (commandName === 'anime' && focused.name === 'query') {
			const results = await autocompleteMedia(focused.value, 'ANIME');
			return this.some(
				results.slice(0, 10).map((item) => ({
					name: `${item.titleRomaji}${item.year ? ` (${item.year})` : ''} [${item.format}]`.slice(
						0,
						100,
					),
					value: String(item.id),
				})),
			);
		}

		if (commandName === 'manga' && focused.name === 'query') {
			const results = await autocompleteMedia(focused.value, 'MANGA');
			return this.some(
				results.slice(0, 10).map((item) => ({
					name: `${item.titleRomaji} [${item.format}]`.slice(0, 100),
					value: String(item.id),
				})),
			);
		}

		if (commandName === 'character' && focused.name === 'query') {
			const results = await autocompleteCharacter(focused.value);
			return this.some(
				results.slice(0, 10).map((item) => ({
					name: `${item.nameFull} — ${item.mediaTitle} (★ ${item.favourites.toLocaleString()})`.slice(
						0,
						100,
					),
					value: String(item.id),
				})),
			);
		}

		if (commandName === 'schedule' && focused.name === 'day') {
			const q = focused.value.trim().toLowerCase();
			const choices = ['today', 'upcoming', 'watchlist', ...SCHEDULE_DAYS.slice(2)];
			return this.some(
				choices
					.filter((d) => d.includes(q))
					.slice(0, 10)
					.map((d) => ({
						name: d.toUpperCase(),
						value: d,
					})),
			);
		}

		if (commandName === 'social' && focused.name === 'action') {
			const q = focused.value.trim().toLowerCase();
			return this.some(
				SOCIAL_ACTIONS.filter(
					(act) => act.includes(q) || SOCIAL_ACTION_META[act].label.toLowerCase().includes(q),
				).map((act) => ({
					name: `${SOCIAL_ACTION_META[act].label} (${act})`,
					value: act,
				})),
			);
		}

		return this.none();
	}

	public override async run(
		interaction: AutocompleteInteraction,
		result: InteractionHandler.ParseResult<this>,
	): Promise<void> {
		await interaction.respond(result);
	}
}
