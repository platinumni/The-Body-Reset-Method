// Estimated UK supermarket prices (mid-range, £), used until official ONS average prices
// are connected. Each ingredient line in a recipe is matched to the first item whose
// pattern fits. `each` is the rough weight in grams of one item, for converting counts.

export type Aisle = "Fruit & veg" | "Meat & fish" | "Dairy & eggs" | "Bakery" | "Tins & jars" | "Rice, pasta & grains" | "Frozen" | "Herbs & spices" | "Oils, sauces & baking";
export type PriceItem = { key: string; label: string; aisle: Aisle; re: RegExp; price: number; pack: number; unit: "g" | "ml" | "each"; each?: number; cupboard?: boolean };

export const PRICES_AS_OF = "October 2026";
export const PRICE_SOURCE = "Estimated mid-range supermarket prices";

const item = (key: string, label: string, aisle: Aisle, re: RegExp, price: number, pack: number, unit: PriceItem["unit"], each?: number, cupboard = false): PriceItem => ({ key, label, aisle, re, price, pack, unit, each, cupboard });
const C = true;

// Order matters: specific patterns first.
export const PRICE_ITEMS: PriceItem[] = [
  // Leftovers and serving suggestions cost nothing extra.
  item("leftover", "Leftovers", "Fruit & veg", /leftover/i, 0, 1, "each"),
  // Fish and seafood
  item("black-cod", "Black cod or white fish fillets", "Meat & fish", /black cod/i, 9.5, 300, "g"),
  item("smoked-salmon", "Smoked salmon", "Meat & fish", /smoked salmon/i, 3.5, 100, "g"),
  item("salmon", "Salmon fillets", "Meat & fish", /salmon/i, 4.5, 240, "g", 120),
  item("sea-bass", "Sea bass fillets", "Meat & fish", /sea bass/i, 5.5, 200, "g", 100),
  item("white-fish", "White fish fillets", "Meat & fish", /white fish/i, 4.75, 400, "g", 130),
  item("cooked-prawns", "Cooked king prawns", "Meat & fish", /cooked king prawns/i, 3.5, 150, "g"),
  item("raw-prawns", "Raw king prawns", "Meat & fish", /prawns/i, 4.0, 200, "g"),
  item("crab", "White crab meat", "Meat & fish", /crab/i, 4.5, 100, "g"),
  item("lobster", "Cooked lobster", "Meat & fish", /lobster/i, 14, 1, "each", 500),
  item("scallops", "King scallops", "Meat & fish", /scallops/i, 6.5, 8, "each", 25),
  item("mussels", "Mussels", "Meat & fish", /mussels/i, 3.5, 500, "g"),
  item("squid", "Squid rings", "Meat & fish", /squid/i, 3.0, 300, "g"),
  item("tuna-tin", "Tinned tuna", "Tins & jars", /tuna/i, 1.25, 145, "g"),
  item("sardines", "Tinned sardines", "Tins & jars", /sardines/i, 0.9, 120, "g"),
  item("mackerel", "Tinned mackerel", "Tins & jars", /mackerel/i, 1.1, 125, "g"),
  item("fish-sauce", "Fish sauce", "Oils, sauces & baking", /fish sauce/i, 1.6, 150, "ml", undefined, C),
  // Meat
  item("pancetta", "Pancetta", "Meat & fish", /pancetta/i, 2.25, 130, "g", 15),
  item("prosciutto", "Prosciutto", "Meat & fish", /prosciutto/i, 2.5, 80, "g", 10),
  item("roast-beef", "Sliced cooked roast beef", "Meat & fish", /roast beef/i, 2.75, 120, "g"),
  item("beef-fillet", "Beef fillet steaks", "Meat & fish", /beef fillet/i, 12, 300, "g", 150),
  item("short-ribs", "Beef short ribs", "Meat & fish", /short ribs/i, 9, 1000, "g"),
  item("steak", "Steak", "Meat & fish", /steak/i, 6, 300, "g", 150),
  item("duck", "Duck breasts", "Meat & fish", /duck/i, 7, 2, "each", 180),
  item("lamb-rack", "Lamb rack", "Meat & fish", /lamb rack/i, 11, 1, "each", 400),
  item("lamb", "Diced lamb", "Meat & fish", /lamb shoulder/i, 7.5, 500, "g"),
  item("sausages", "Pork sausages", "Meat & fish", /sausages/i, 2.5, 8, "each", 60),
  item("chicken-thighs-bone", "Bone-in chicken thighs", "Meat & fish", /bone-in chicken thighs/i, 3.5, 1000, "g", 125),
  item("chicken-thighs", "Boneless chicken thighs", "Meat & fish", /chicken thighs|thighs/i, 4.0, 500, "g", 100),
  item("chicken-breast", "Chicken breasts", "Meat & fish", /chicken breasts?/i, 4.25, 600, "g", 150),
  // Stock before anything named chicken or fish
  item("stock", "Stock cubes", "Oils, sauces & baking", /stock/i, 1.2, 10, "each", 500, C),
  // Dairy and eggs
  item("eggs", "Eggs", "Dairy & eggs", /\begg/i, 2.0, 6, "each", 55),
  item("tofu", "Tofu", "Dairy & eggs", /tofu/i, 1.75, 280, "g"),
  item("burrata", "Burrata", "Dairy & eggs", /burrata/i, 3.0, 150, "g"),
  item("mozzarella", "Mozzarella", "Dairy & eggs", /mozzarella/i, 0.75, 125, "g"),
  item("halloumi", "Halloumi", "Dairy & eggs", /halloumi/i, 2.5, 225, "g"),
  item("paneer", "Paneer", "Dairy & eggs", /paneer/i, 2.5, 225, "g"),
  item("feta", "Feta", "Dairy & eggs", /feta/i, 1.75, 200, "g"),
  item("ricotta", "Ricotta", "Dairy & eggs", /ricotta/i, 1.5, 250, "g"),
  item("cottage", "Cottage cheese", "Dairy & eggs", /cottage cheese/i, 1.2, 300, "g"),
  item("hard-cheese", "Hard cheese (Parmesan or vegetarian)", "Dairy & eggs", /parmesan|hard cheese/i, 2.5, 100, "g", undefined),
  item("cheddar", "Cheddar", "Dairy & eggs", /cheddar/i, 2.5, 350, "g"),
  item("soft-cheese", "Soft cheese", "Dairy & eggs", /soft cheese/i, 1.1, 180, "g"),
  item("creme-fraiche", "Crème fraîche", "Dairy & eggs", /crème fraîche/i, 1.1, 200, "ml"),
  item("double-cream", "Double cream", "Dairy & eggs", /double cream/i, 1.2, 300, "ml"),
  item("single-cream", "Single cream", "Dairy & eggs", /single cream/i, 1.0, 300, "ml"),
  item("plant-yoghurt", "Plant-based yoghurt", "Dairy & eggs", /plant-based yoghurt/i, 1.75, 400, "g"),
  item("greek-yoghurt", "Greek yoghurt", "Dairy & eggs", /greek yoghurt/i, 1.6, 500, "g"),
  item("yoghurt", "Natural yoghurt", "Dairy & eggs", /yoghurt/i, 0.75, 500, "g"),
  item("butter", "Butter", "Dairy & eggs", /^butter|\bbutter$|dairy-free spread/i, 2.2, 250, "g", undefined, C),
  item("coconut-drinking", "Coconut drinking milk", "Dairy & eggs", /coconut drinking milk/i, 1.6, 1000, "ml"),
  item("plant-milk", "Plant milk", "Dairy & eggs", /oat milk|plant milk/i, 1.5, 1000, "ml"),
  item("milk", "Milk", "Dairy & eggs", /\bmilk\b(?!.*coconut)/i, 1.45, 2272, "ml"),
  // Bakery
  item("brioche", "Brioche", "Bakery", /brioche/i, 1.6, 6, "each", 50),
  item("baguette", "Baguette", "Bakery", /baguette/i, 0.85, 2, "each", 200),
  item("ciabatta", "Ciabatta or sourdough", "Bakery", /ciabatta/i, 1.5, 1, "each", 270),
  item("sourdough", "Sourdough loaf", "Bakery", /sourdough/i, 2.5, 16, "each", 45),
  item("rye", "Rye bread", "Bakery", /rye bread/i, 1.75, 12, "each", 40),
  item("pitta", "Pitta breads", "Bakery", /pitta/i, 0.85, 6, "each", 60),
  item("flatbread", "Flatbreads", "Bakery", /flatbread/i, 1.25, 4, "each", 80),
  item("tortillas", "Tortilla wraps", "Bakery", /tortilla/i, 1.2, 8, "each", 60),
  item("rice-cakes", "Rice cakes", "Bakery", /rice cakes/i, 0.85, 20, "each", 8),
  item("bread", "Wholemeal bread", "Bakery", /bread/i, 1.2, 20, "each", 40),
  item("puff-pastry", "Puff pastry", "Bakery", /puff pastry/i, 1.6, 320, "g"),
  item("gnocchi", "Fresh gnocchi", "Rice, pasta & grains", /gnocchi/i, 1.4, 500, "g"),
  // Rice, pasta, grains
  item("risotto-rice", "Risotto or paella rice", "Rice, pasta & grains", /risotto rice|paella rice/i, 1.75, 500, "g", undefined, C),
  item("cooked-rice", "Rice", "Rice, pasta & grains", /cooked rice/i, 1.2, 2000, "g", undefined, C),
  item("rice-noodles", "Rice noodles", "Rice, pasta & grains", /rice noodles/i, 1.2, 250, "g"),
  item("udon", "Udon noodles", "Rice, pasta & grains", /udon/i, 1.5, 2, "each", 200),
  item("soba", "Soba noodles", "Rice, pasta & grains", /soba/i, 1.75, 250, "g"),
  item("noodles", "Egg or wheat noodles", "Rice, pasta & grains", /noodles/i, 1.0, 300, "g"),
  item("rice", "Rice", "Rice, pasta & grains", /rice\b/i, 1.2, 1000, "g", undefined, C),
  item("orzo", "Orzo", "Rice, pasta & grains", /orzo/i, 1.0, 500, "g", undefined, C),
  item("couscous", "Couscous", "Rice, pasta & grains", /couscous/i, 0.9, 500, "g", undefined, C),
  item("pasta", "Pasta", "Rice, pasta & grains", /pasta|spaghetti|linguine|ditalini/i, 0.75, 500, "g", undefined, C),
  item("oats", "Rolled oats", "Rice, pasta & grains", /oats|granola/i, 0.95, 1000, "g", undefined, C),
  item("red-lentils", "Red lentils", "Rice, pasta & grains", /red lentils/i, 1.4, 500, "g", undefined, C),
  item("popcorn", "Popcorn kernels", "Rice, pasta & grains", /popcorn/i, 1.0, 500, "g", undefined, C),
  item("panko", "Panko breadcrumbs", "Rice, pasta & grains", /panko/i, 1.25, 200, "g", undefined, C),
  item("chia", "Chia seeds", "Rice, pasta & grains", /chia/i, 2.0, 200, "g", undefined, C),
  // Tins and jars
  item("chopped-tomatoes", "Chopped tomatoes", "Tins & jars", /chopped tomatoes/i, 0.55, 400, "g"),
  item("baked-beans", "Baked beans", "Tins & jars", /baked beans/i, 0.65, 415, "g"),
  item("green-lentils", "Tinned green lentils", "Tins & jars", /green lentils/i, 0.85, 400, "g"),
  item("chickpeas", "Chickpeas", "Tins & jars", /chickpeas/i, 0.6, 400, "g"),
  item("beans", "Tinned beans", "Tins & jars", /black beans|butter beans|cannellini|borlotti|kidney|mixed beans|black or kidney/i, 0.7, 400, "g"),
  item("sweetcorn", "Sweetcorn", "Tins & jars", /sweetcorn/i, 0.6, 198, "g"),
  item("coconut-milk", "Coconut milk", "Tins & jars", /coconut milk/i, 1.0, 400, "ml", undefined, C),
  item("roasted-peppers", "Roasted red peppers (jar)", "Tins & jars", /roasted red peppers/i, 1.5, 6, "each", 50),
  item("sun-dried", "Sun-dried tomatoes", "Tins & jars", /sun-dried/i, 1.75, 280, "g"),
  item("olives", "Olives", "Tins & jars", /olives/i, 1.25, 200, "g", 4),
  item("capers", "Capers", "Tins & jars", /capers/i, 1.0, 100, "g", undefined, C),
  item("cornichons", "Cornichons or pickles", "Tins & jars", /cornichons|pickles/i, 1.2, 340, "g", 8),
  item("pineapple", "Pineapple", "Fruit & veg", /pineapple/i, 1.4, 1, "each", 700),
  item("hummus", "Hummus", "Tins & jars", /hummus/i, 1.0, 200, "g"),
  item("salsa", "Tomato salsa", "Tins & jars", /salsa/i, 1.3, 300, "g"),
  item("chutney", "Mango chutney", "Tins & jars", /chutney/i, 1.2, 340, "g", undefined, C),
  item("pesto", "Vegetarian pesto", "Tins & jars", /pesto/i, 1.5, 190, "g"),
  item("horseradish", "Creamed horseradish", "Tins & jars", /horseradish/i, 1.0, 185, "g", undefined, C),
  item("peanut-butter", "Peanut butter", "Tins & jars", /peanut butter/i, 1.75, 340, "g", undefined, C),
  item("almond-butter", "Almond butter", "Tins & jars", /almond butter/i, 3.5, 170, "g", undefined, C),
  item("tahini", "Tahini", "Tins & jars", /tahini/i, 2.25, 300, "g", undefined, C),
  item("curry-paste", "Curry paste", "Tins & jars", /curry paste|masala paste|laksa paste|jerk seasoning/i, 1.5, 190, "g", undefined, C),
  item("gochujang", "Gochujang paste", "Tins & jars", /gochujang|chilli bean paste/i, 3.0, 200, "g", undefined, C),
  item("harissa", "Harissa paste", "Tins & jars", /harissa/i, 1.5, 90, "g", undefined, C),
  item("miso", "White miso paste", "Tins & jars", /miso/i, 2.75, 200, "g", undefined, C),
  item("pomegranate-molasses", "Pomegranate molasses", "Tins & jars", /pomegranate molasses/i, 2.0, 250, "ml", undefined, C),
  item("tomato-puree", "Tomato purée", "Tins & jars", /tomato purée/i, 0.6, 200, "g", undefined, C),
  item("golden-syrup", "Golden syrup", "Oils, sauces & baking", /golden syrup/i, 1.4, 454, "g", undefined, C),
  // Frozen
  item("peas", "Frozen peas", "Frozen", /peas\b(?!.*sugar)|frozen peas/i, 1.25, 1000, "g"),
  item("edamame", "Frozen edamame", "Frozen", /edamame/i, 2.0, 500, "g"),
  item("berries", "Mixed berries", "Frozen", /berries|raspberries|blueberries/i, 2.25, 500, "g"),
  // Fruit and veg
  item("sugar-snap", "Sugar snap peas", "Fruit & veg", /sugar snap/i, 1.0, 160, "g"),
  item("onion-red", "Red onions", "Fruit & veg", /red onion/i, 0.75, 3, "each", 150),
  item("shallot", "Shallots", "Fruit & veg", /shallot/i, 0.9, 6, "each", 40),
  item("spring-onion", "Spring onions", "Fruit & veg", /spring onion/i, 0.5, 8, "each", 15),
  item("onion", "Onions", "Fruit & veg", /onion/i, 0.85, 6, "each", 150),
  item("garlic", "Garlic", "Fruit & veg", /garlic(?! powder| granules)/i, 0.45, 10, "each", 5),
  item("ginger", "Fresh ginger", "Fruit & veg", /ginger(?!.*ground)/i, 0.5, 100, "g"),
  item("sweet-potato", "Sweet potatoes", "Fruit & veg", /sweet potato/i, 1.2, 1000, "g", 300),
  item("new-potatoes", "New potatoes", "Fruit & veg", /new potatoes/i, 1.1, 1000, "g", 50),
  item("potatoes", "Potatoes", "Fruit & veg", /potato/i, 1.5, 2500, "g", 250),
  item("carrots", "Carrots", "Fruit & veg", /carrot/i, 0.6, 1000, "g", 100),
  item("celeriac", "Celeriac", "Fruit & veg", /celeriac/i, 1.1, 1, "each", 600),
  item("celery", "Celery", "Fruit & veg", /celery/i, 0.7, 8, "each", 40),
  item("tomatoes-cherry", "Cherry tomatoes", "Fruit & veg", /cherry tomatoes/i, 1.0, 250, "g", 15),
  item("tomatoes", "Tomatoes", "Fruit & veg", /tomato/i, 0.95, 6, "each", 80),
  item("cucumber", "Cucumber", "Fruit & veg", /cucumber/i, 0.75, 1, "each", 350),
  item("courgette", "Courgettes", "Fruit & veg", /courgette/i, 1.0, 3, "each", 200),
  item("aubergine", "Aubergines", "Fruit & veg", /aubergine/i, 0.9, 1, "each", 300),
  item("peppers", "Peppers", "Fruit & veg", /pepper(?!corn)(?!.*(black|cayenne|aleppo|sichuan))/i, 1.6, 3, "each", 160),
  item("mushrooms", "Mushrooms", "Fruit & veg", /mushroom|porcini/i, 1.2, 300, "g"),
  item("broccoli", "Broccoli", "Fruit & veg", /broccoli/i, 0.75, 350, "g", 350),
  item("cauliflower", "Cauliflower", "Fruit & veg", /cauliflower/i, 1.0, 1, "each", 700),
  item("cabbage-red", "Red cabbage", "Fruit & veg", /red cabbage/i, 0.9, 1, "each", 900),
  item("cabbage", "Cabbage or kale", "Fruit & veg", /cabbage|kale/i, 0.85, 1, "each", 800),
  item("pak-choi", "Pak choi", "Fruit & veg", /pak choi/i, 1.0, 250, "g"),
  item("green-beans", "Green beans", "Fruit & veg", /green beans/i, 1.0, 200, "g"),
  item("beansprouts", "Beansprouts", "Fruit & veg", /beansprouts/i, 0.75, 300, "g"),
  item("spinach", "Spinach", "Fruit & veg", /spinach/i, 1.25, 240, "g"),
  item("rocket", "Rocket or salad leaves", "Fruit & veg", /rocket|watercress|salad leaves/i, 1.0, 80, "g"),
  item("lettuce", "Little gem lettuce", "Fruit & veg", /lettuce/i, 0.85, 2, "each", 150),
  item("cress", "Cress", "Fruit & veg", /cress/i, 0.5, 1, "each", 30),
  item("radishes", "Radishes", "Fruit & veg", /radishes/i, 0.6, 240, "g", 12),
  item("fennel", "Fennel", "Fruit & veg", /fennel bulb/i, 1.0, 1, "each", 250),
  item("avocado", "Avocados", "Fruit & veg", /avocado/i, 0.85, 1, "each", 170),
  item("lemon-juice", "Lemons", "Fruit & veg", /lemon juice/i, 0.3, 1, "each", 40),
  item("lemon", "Lemons", "Fruit & veg", /lemon/i, 0.3, 1, "each", 100),
  item("lime", "Limes", "Fruit & veg", /lime/i, 0.3, 1, "each", 70),
  item("orange", "Oranges", "Fruit & veg", /orange/i, 0.4, 1, "each", 180),
  item("apple-juice", "Apple juice", "Dairy & eggs", /apple juice/i, 1.0, 1000, "ml"),
  item("apple", "Apples", "Fruit & veg", /apple/i, 1.6, 6, "each", 150),
  item("pear", "Pears", "Fruit & veg", /pear\b/i, 1.6, 4, "each", 170),
  item("banana", "Bananas", "Fruit & veg", /banana/i, 0.85, 5, "each", 120),
  item("mango", "Mangoes", "Fruit & veg", /mango/i, 1.0, 1, "each", 300),
  item("kiwi", "Kiwi fruit", "Fruit & veg", /kiwi/i, 0.85, 4, "each", 75),
  item("melon", "Melon", "Fruit & veg", /melon/i, 1.5, 1, "each", 1000),
  item("peaches", "Peaches or nectarines", "Fruit & veg", /peach/i, 1.5, 4, "each", 150),
  item("figs", "Figs", "Fruit & veg", /figs/i, 2.0, 4, "each", 50),
  item("grapes", "Red grapes", "Fruit & veg", /grapes/i, 1.75, 500, "g"),
  item("cherries", "Cherries", "Frozen", /cherries/i, 2.5, 350, "g"),
  item("dates", "Pitted dates", "Rice, pasta & grains", /dates/i, 1.5, 250, "g"),
  item("pomegranate", "Pomegranate seeds", "Fruit & veg", /pomegranate/i, 1.5, 80, "g"),
  item("apricots", "Dried apricots or raisins", "Rice, pasta & grains", /apricots|raisins/i, 1.2, 250, "g", undefined, C),
  // Fresh herbs
  item("herbs", "Fresh herbs", "Fruit & veg", /coriander(?!.*ground)|parsley|basil|mint|dill|chives|thyme|rosemary|sage|thai basil/i, 0.75, 30, "g", 1),
  // Chilli (fresh) before dried spices
  item("chilli-fresh", "Fresh chillies", "Fruit & veg", /^(red|green) chilli$/i, 0.6, 4, "each", 10),
  // Nuts and seeds
  item("pistachios", "Pistachios", "Rice, pasta & grains", /pistachio/i, 3.0, 150, "g", undefined, C),
  item("almonds", "Almonds", "Rice, pasta & grains", /almonds/i, 2.0, 200, "g", undefined, C),
  item("walnuts", "Walnuts or hazelnuts", "Rice, pasta & grains", /walnuts|hazelnuts/i, 2.0, 150, "g", undefined, C),
  item("mixed-nuts", "Mixed nuts", "Rice, pasta & grains", /nuts\b/i, 3.0, 250, "g", undefined, C),
  item("peanuts", "Roasted peanuts", "Rice, pasta & grains", /peanuts/i, 1.0, 200, "g", undefined, C),
  item("seeds", "Mixed seeds", "Rice, pasta & grains", /pumpkin seeds|mixed seeds/i, 1.75, 200, "g", undefined, C),
  item("sesame-seeds", "Sesame seeds", "Herbs & spices", /sesame seeds/i, 1.0, 100, "g", undefined, C),
  item("coconut-flakes", "Coconut flakes", "Rice, pasta & grains", /coconut flakes/i, 1.5, 100, "g", undefined, C),
  // Oils, sauces, baking (cupboard)
  item("truffle-oil", "Truffle oil", "Oils, sauces & baking", /truffle oil/i, 4.0, 100, "ml", undefined, C),
  item("sesame-oil", "Sesame oil", "Oils, sauces & baking", /sesame oil/i, 2.0, 150, "ml", undefined, C),
  item("chilli-crisp", "Chilli crisp oil", "Oils, sauces & baking", /chilli crisp/i, 2.5, 200, "g", undefined, C),
  item("olive-oil", "Olive oil", "Oils, sauces & baking", /olive oil/i, 4.5, 500, "ml", undefined, C),
  item("oil", "Vegetable oil", "Oils, sauces & baking", /oil/i, 2.0, 1000, "ml", undefined, C),
  item("soy-sauce", "Soy sauce", "Oils, sauces & baking", /soy sauce/i, 1.2, 150, "ml", undefined, C),
  item("sweet-chilli", "Sweet chilli sauce", "Oils, sauces & baking", /sweet chilli/i, 1.2, 280, "ml", undefined, C),
  item("sriracha", "Sriracha", "Oils, sauces & baking", /sriracha/i, 2.0, 200, "ml", undefined, C),
  item("balsamic", "Balsamic vinegar", "Oils, sauces & baking", /balsamic/i, 1.5, 250, "ml", undefined, C),
  item("vinegar", "Vinegar", "Oils, sauces & baking", /vinegar/i, 1.0, 350, "ml", undefined, C),
  item("vegan-mayo", "Vegan mayonnaise", "Oils, sauces & baking", /vegan mayonnaise/i, 1.75, 250, "ml", undefined, C),
  item("mayo", "Mayonnaise", "Oils, sauces & baking", /mayonnaise|mayo\b/i, 1.5, 400, "ml", undefined, C),
  item("mustard", "Mustard", "Oils, sauces & baking", /mustard/i, 1.0, 185, "g", undefined, C),
  item("honey", "Honey", "Oils, sauces & baking", /honey/i, 1.6, 340, "g", undefined, C),
  item("maple", "Maple syrup", "Oils, sauces & baking", /maple/i, 2.75, 250, "ml", undefined, C),
  item("wine", "Red wine (optional)", "Oils, sauces & baking", /wine|brandy/i, 5.0, 750, "ml", undefined, C),
  item("cocoa", "Cocoa powder", "Oils, sauces & baking", /cocoa/i, 2.0, 250, "g", undefined, C),
  item("chocolate", "Dark chocolate", "Oils, sauces & baking", /chocolate/i, 1.1, 100, "g"),
  item("sugar", "Sugar", "Oils, sauces & baking", /sugar/i, 1.0, 1000, "g", undefined, C),
  item("flour", "Plain flour", "Oils, sauces & baking", /flour/i, 0.8, 1500, "g", undefined, C),
  item("cornflour", "Cornflour", "Oils, sauces & baking", /cornflour/i, 1.0, 250, "g", undefined, C),
  item("baking-powder", "Baking powder", "Oils, sauces & baking", /baking powder/i, 1.0, 170, "g", undefined, C),
  // Herbs and spices (cupboard)
  item("saffron", "Saffron", "Herbs & spices", /saffron/i, 2.5, 0.4, "g", undefined, C),
  item("salt", "Salt", "Herbs & spices", /salt\b/i, 0.65, 750, "g", undefined, C),
  item("peppercorns", "Black pepper", "Herbs & spices", /black pepper|peppercorns/i, 1.5, 100, "g", undefined, C),
  item("spices", "Dried spices and herbs", "Herbs & spices", /ground|paprika|cumin|turmeric|cinnamon|curry powder|garam masala|chilli flakes|chilli powder|oregano|mixed herbs|ras el hanout|cajun|tandoori|fennel seeds|garlic powder|garlic granules|aleppo|cardamom|sichuan/i, 1.0, 40, "g", undefined, C),
];

const FRACTION = /^(\d+)\/(\d+)$/;
const num = (s: string) => {
  const f = FRACTION.exec(s);
  return f ? Number(f[1]) / Number(f[2]) : Number(s);
};

/** Turns "2 x 150g", "1 tbsp", "3cm piece", "1 small bunch" into a quantity in grams (g/ml) or a count. */
export function parseAmount(amount: string): { qty: number; unit: "g" | "count" } {
  const a = amount.trim().toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^([\d./]+)\s*x\s*([\d.]+)\s*(g|ml|kg)/.exec(a))) return { qty: num(m[1]!) * Number(m[2]) * (m[3] === "kg" ? 1000 : 1), unit: "g" };
  if ((m = /^([\d.]+)\s*(kg|litres?)\b/.exec(a))) return { qty: Number(m[1]) * 1000, unit: "g" };
  if ((m = /^([\d.]+)\s*(g|ml)\b/.exec(a))) return { qty: Number(m[1]), unit: "g" };
  if ((m = /^([\d./]+)\s*cm/.exec(a))) return { qty: num(m[1]!) * 5, unit: "g" };
  if ((m = /^([\d./]+)\s+(.*)$/.exec(a))) {
    const n = num(m[1]!);
    const rest = m[2]!;
    const per: [RegExp, number][] = [
      [/tbsp/, 15], [/tsp/, 5], [/pinch/, 0.5], [/large bunch/, 50], [/bunch/, 25], [/small handful/, 15], [/handful/, 30],
      [/thick slices?/, 50], [/slices?/, 40], [/cloves?/, 5], [/sprigs?/, 2], [/sticks?/, 40], [/ball/, 125], [/bag/, 80], [/punnet/, 30], [/leaves/, 0.5],
    ];
    for (const [re, g] of per) if (re.test(rest)) return { qty: n * g, unit: "g" };
    return { qty: n, unit: "count" };
  }
  const n = num(a);
  return Number.isFinite(n) ? { qty: n, unit: "count" } : { qty: 1, unit: "count" };
}

export function priceItemFor(name: string): PriceItem | null {
  return PRICE_ITEMS.find((p) => p.re.test(name)) ?? null;
}

/** How much of the item's pack unit an ingredient line uses. */
export function usage(item: PriceItem, amount: string): number {
  const a = parseAmount(amount);
  if (item.unit === "each") return a.unit === "count" ? a.qty : a.qty / (item.each ?? 100);
  return a.unit === "g" ? a.qty : a.qty * (item.each ?? 100);
}
