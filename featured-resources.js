import { supabase } from './supabase-client.js';

const section = document.querySelector('#featured-resources');
const grid = document.querySelector('#featured-resources-grid');
const status = document.querySelector('#featured-resources-status');

if (section && grid && status) {
    async function loadFeaturedResources() {
        if (!supabase) {
            console.error('Featured resources could not load because Supabase is not configured.');
            return;
        }

        try {
            const { data, error } = await supabase.from('resources')
                .select('id,title,summary,type,category,icon_url,featured_order')
                .eq('status', 'published')
                .eq('is_featured', true)
                .order('featured_order', { ascending: true })
                .limit(4);
            if (error) throw error;
            if (!data?.length) return;

            for (const resource of data) {
                const card = document.createElement('article');
                const heading = document.createElement('h3');
                const link = document.createElement('a');
                const summary = document.createElement('p');
                const category = document.createElement('span');

                card.className = 'resource-featured-card';
                link.href = `resource-detail.html?id=${encodeURIComponent(resource.id)}`;
                link.textContent = resource.title;
                heading.append(link);
                summary.textContent = resource.summary;
                category.textContent = resource.category || resource.type;

                if (resource.icon_url) {
                    const icon = document.createElement('img');
                    icon.src = resource.icon_url;
                    icon.alt = '';
                    icon.loading = 'lazy';
                    icon.addEventListener('error', () => icon.remove(), { once: true });
                    card.append(icon);
                }

                card.append(category, heading, summary);
                grid.append(card);
            }
            section.hidden = false;
            status.textContent = `${data.length} featured resource${data.length === 1 ? '' : 's'}.`;
        } catch (error) {
            console.error('Could not load featured resources.', error);
            status.textContent = 'Featured resources are temporarily unavailable.';
        }
    }

    void loadFeaturedResources();
}
