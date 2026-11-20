/**
 * The welcome example and the templates of the "New" menu, each with its name and CSV text.
 */

/** The document "My documents" starts with when it is empty. */
export const START = {
    name: 'Welcome',
    code: `City,Country,Population,Founded,Note
Zurich,Switzerland,"421,878",1218,"Largest city, on Lake Zurich"
Geneva,Switzerland,"203,856",-121,"Seat of many ""international"" organizations"
Basel,Switzerland,"173,863",1225,On the Rhine
Bern,Switzerland,"134,794",1191,"Federal city
(capital in all but name)"
Lausanne,Switzerland,"139,111",1434,
Schaffhausen,Switzerland,"37,035",1045,Near the Rhine Falls
`,
};

/** The templates of the "New" menu by their data-new value. */
export const TEMPLATES = {
    contacts: {
        name: 'Contacts',
        code: `First name,Last name,Email,Phone,Company
Anna,Meier,anna.meier@example.com,+41 44 123 45 67,Example AG
Luca,Rossi,luca.rossi@example.com,+41 91 765 43 21,
Sophie,Dubois,sophie.dubois@example.com,,"Dubois & Fils"
`,
    },
    products: {
        name: 'Products',
        code: `SKU,Product,Category,Price,Stock
A-100,Notebook A5,Paper,4.50,120
A-101,Notebook A4,Paper,6.90,85
B-200,"Pen, blue",Writing,1.20,500
B-201,"Pen, black",Writing,1.20,430
C-300,Stapler,Office,12.00,24
`,
    },
    budget: {
        name: 'Budget',
        code: `Month;Income;Rent;Food;Transport;Other
January;5200,00;1800,00;650,00;120,00;300,00
February;5200,00;1800,00;610,00;120,00;450,00
March;5350,00;1800,00;700,00;95,00;220,00
`,
    },
    timesheet: {
        name: 'Time sheet',
        code: `Date\tProject\tTask\tHours
2026-01-14\tWebsite\tDesign of the start page\t3.5
2026-01-14\tWebsite\tMeeting\t1
2026-01-15\tShop\tProduct import\t5.25
`,
    },
};
